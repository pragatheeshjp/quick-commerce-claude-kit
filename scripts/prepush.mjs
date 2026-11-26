#!/usr/bin/env node
// Pre-push checks (tiered by speed and by what actually changed). Documented in docs/git-hooks.md.
//
// Git calls the hook with "<remote> <url>" and sends one line per ref being pushed on stdin:
//   <local ref> <local sha> <remote ref> <remote sha>
//
// ALWAYS (about a second): protected-branch rule, forbidden files, secrets in added lines, CRLF/BOM,
//   file size, migration immutability and naming.
// ONLY WHEN THAT APP CHANGED: backend (lint, typecheck, unit tests) and/or frontend (same).
// LEFT TO CI: production builds, Docker, npm audit, coverage, live Supabase tests.
//
// Overrides (emergencies only; CI still runs): `git push --no-verify`, SKIP_PREPUSH=1,
//   ALLOW_PUSH_TO_MAIN=1, ALLOW_MIGRATION_EDIT=1.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ZERO_SHA = "0".repeat(40);
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const PROTECTED_REFS = new Set(["refs/heads/main", "refs/heads/master"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const TEXT_FILE = /\.(ts|tsx|mts|mjs|js|json|css|md|yml|yaml|sql|toml|example|html|txt|sh)$|(^|\/)(Dockerfile|\.gitignore|\.gitattributes|\.dockerignore|pre-push)$/;
const LOCKFILE = /(^|\/)package-lock\.json$/;
// Real env files and key material must never be committed (".env.example" is fine).
const FORBIDDEN_FILE = /(^|\/)\.env($|\.(?!example$))|\.(pem|key|p12|pfx)$/;
const MIGRATION_DIR = "supabase/migrations/";
const MIGRATION_NAME = /^[0-9]{14}_[a-z0-9_]+\.sql$/;

// Obvious placeholders are allowed (same idea as .claude/hooks/guard-secrets.mjs and the CI hygiene job).
const PLACEHOLDER = /(test|placeholder|not-real|not_real|example|replace|change-?me|your-|xxx|dummy|fake|sample)/i;
const SECRET_RULES = [
  { name: "Supabase secret key (sb_secret_...)", re: /sb_secret_[A-Za-z0-9_-]{16,}/ },
  { name: "Supabase access token (sbp_...)", re: /sbp_[A-Za-z0-9]{30,}/ },
  { name: "JWT (Supabase service-role / anon keys are JWTs)", re: /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/ },
  {
    name: "secret-looking assignment (KEY / SECRET / PASSWORD / TOKEN)",
    re: /\b[A-Z][A-Z0-9_]*(?:SERVICE_ROLE_KEY|SECRET_KEY|SECRET|PASSWORD|ACCESS_TOKEN|API_KEY)\b\s*[=:]\s*["']?([A-Za-z0-9._\-/+]{20,})/,
    group: 1,
  },
];

// ---------------------------------------------------------------- pure helpers (unit-tested)

export const branchName = (ref) => ref.replace(/^refs\/heads\//, "");
export const isProtectedRef = (ref) => PROTECTED_REFS.has(ref);

/** Parses `git diff --name-status --no-renames` output into [{ status, file }]. */
export function parseNameStatus(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status, ...rest] = line.split("\t");
      return { status: status[0], file: rest.join("\t") };
    });
}

/** Scans the ADDED lines of a `git diff -U0` for secrets. Returns [{ file, line, rule }] (one per file+rule). */
export function scanAddedLines(diffText) {
  const hits = [];
  const seen = new Set();
  let file = "";
  let line = 0;
  for (const raw of diffText.split(/\r?\n/)) {
    if (raw.startsWith("+++ ")) {
      file = raw.startsWith("+++ b/") ? raw.slice(6) : "";
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(raw);
    if (hunk) {
      line = Number(hunk[1]) - 1;
      continue;
    }
    if (!raw.startsWith("+") || !file) continue;
    line++;
    const content = raw.slice(1);
    for (const rule of SECRET_RULES) {
      const m = rule.re.exec(content);
      if (!m) continue;
      const value = rule.group ? m[rule.group] : m[0];
      if (PLACEHOLDER.test(value)) continue;
      const key = `${file}|${rule.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ file, line, rule: rule.name });
    }
  }
  return hits;
}

/** Problems with migration files changed in a push. `all` = every migration path at the pushed commit. */
export function migrationProblems(changes, all, env = {}) {
  const problems = [];
  for (const { status, file } of changes) {
    if (!file.startsWith(MIGRATION_DIR)) continue;
    const name = file.slice(MIGRATION_DIR.length);
    if (status === "A") {
      if (!MIGRATION_NAME.test(name)) problems.push(`Migration "${name}" must be named <14-digit timestamp>_<snake_case>.sql`);
    } else if (!env.ALLOW_MIGRATION_EDIT) {
      problems.push(
        `Existing migration "${name}" was ${status === "D" ? "deleted" : "modified"}. Applied migrations are immutable: ` +
          "add a NEW migration instead (set ALLOW_MIGRATION_EDIT=1 only if this one was never applied).",
      );
    }
  }
  const stamps = new Map();
  for (const file of all) {
    const stamp = file.slice(MIGRATION_DIR.length).split("_")[0];
    stamps.set(stamp, (stamps.get(stamp) ?? 0) + 1);
  }
  for (const [stamp, n] of stamps) if (n > 1) problems.push(`Duplicate migration timestamp ${stamp} (${n} files).`);
  return problems;
}

export function protectedBranchProblem(update, env = {}) {
  if (!isProtectedRef(update.remoteRef)) return null;
  const name = branchName(update.remoteRef);
  if (update.localSha === ZERO_SHA) return `Deleting "${name}" on the remote is blocked.`;
  if (update.remoteSha === ZERO_SHA) return null; // creating it (first push into an empty repo) is allowed
  if (env.ALLOW_PUSH_TO_MAIN === "1") return null;
  return (
    `Direct pushes to "${name}" are blocked. Use a branch and a pull request:\n` +
    "        git switch -c feature/<short-name>\n" +
    "        git push -u origin feature/<short-name>      (then open a pull request on GitHub)\n" +
    "      (emergency only: set ALLOW_PUSH_TO_MAIN=1 for one push; GitHub branch protection still applies)"
  );
}

// ---------------------------------------------------------------- git + process plumbing

let repoRoot = process.cwd();
function git(args, opts = {}) {
  const r = spawnSync("git", args, { cwd: repoRoot, encoding: opts.buffer ? "buffer" : "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${String(r.stderr).trim()}`);
  return opts.buffer ? r.stdout : r.stdout.trim();
}
const gitOk = (args) => spawnSync("git", args, { cwd: repoRoot, stdio: "ignore" }).status === 0;
const hasCommit = (sha) => gitOk(["cat-file", "-e", `${sha}^{commit}`]);

function baseFor(update, remote) {
  if (update.remoteSha !== ZERO_SHA && hasCommit(update.remoteSha)) return update.remoteSha;
  // New branch (or unknown remote state): compare against what the remote's main already has.
  for (const name of ["main", "master"]) {
    const ref = `refs/remotes/${remote}/${name}`;
    if (gitOk(["rev-parse", "--verify", "--quiet", ref])) {
      try {
        return git(["merge-base", update.localSha, ref]);
      } catch {
        /* fall through */
      }
    }
  }
  return EMPTY_TREE; // first push into an empty repository: everything is new
}

function runStep(cwd, script) {
  const started = Date.now();
  const r = spawnSync(`npm run ${script} --silent`, {
    cwd,
    shell: true,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  return { ok: r.status === 0, seconds: (Date.now() - started) / 1000, output: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

const log = (s) => console.log(`pre-push: ${s}`);
const fmt = (sec) => `${sec.toFixed(1)}s`;

// ---------------------------------------------------------------- main

async function readStdin() {
  let data = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  if (process.env.SKIP_PREPUSH === "1") {
    log("SKIPPED (SKIP_PREPUSH=1). CI will still run every check.");
    return 0;
  }
  repoRoot = git(["rev-parse", "--show-toplevel"]);
  const remote = process.argv[2] ?? "origin";
  const updates = (await readStdin())
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [localRef, localSha, remoteRef, remoteSha] = l.trim().split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    });
  if (updates.length === 0) return 0;

  const started = Date.now();
  const problems = [];
  const notes = [];
  const appsToCheck = new Set();

  for (const u of updates) {
    const label = `${branchName(u.localRef)} -> ${remote}/${branchName(u.remoteRef)}`;
    const blocked = protectedBranchProblem(u, process.env);
    if (blocked) {
      problems.push(blocked);
      continue;
    }
    if (u.localSha === ZERO_SHA || u.remoteRef.startsWith("refs/tags/")) continue; // deletions and tags need no checks

    const base = baseFor(u, remote);
    const changes = parseNameStatus(git(["diff", "--name-status", "--no-renames", base, u.localSha]));
    log(`${label}: ${changes.length} changed file(s)`);
    const present = changes.filter((c) => c.status !== "D");

    // 1. forbidden files, size, line endings, BOM
    const fileProblems = [];
    for (const { file } of present) {
      if (FORBIDDEN_FILE.test(file)) fileProblems.push(`${file}: env files and key/cert files must not be committed.`);
    }
    for (const { file } of present.filter((c) => !FORBIDDEN_FILE.test(c.file))) {
      const size = Number(git(["cat-file", "-s", `${u.localSha}:${file}`]));
      if (size > MAX_FILE_BYTES && !LOCKFILE.test(file)) fileProblems.push(`${file}: ${(size / 1048576).toFixed(1)} MB is too large to commit.`);
      if (!TEXT_FILE.test(file) || LOCKFILE.test(file)) continue;
      const blob = git(["show", `${u.localSha}:${file}`], { buffer: true });
      if (blob.length >= 3 && blob[0] === 0xef && blob[1] === 0xbb && blob[2] === 0xbf) fileProblems.push(`${file}: starts with a UTF-8 BOM (breaks .gitignore/.env/YAML parsing). Save as UTF-8 without BOM.`);
      if (blob.includes(Buffer.from("\r\n"))) fileProblems.push(`${file}: contains CRLF line endings; the repo uses LF (see .gitattributes).`);
    }
    problems.push(...fileProblems);
    log(`  ${fileProblems.length ? "FAIL" : "ok  "} file hygiene (env/key files, size, BOM, CRLF)`);

    // 2. secrets in added lines
    const diff = git(["diff", "-U0", "--no-color", "--no-renames", base, u.localSha, "--", ".", ":(exclude)*package-lock.json"]);
    const secrets = scanAddedLines(diff);
    for (const s of secrets) problems.push(`${s.file}:${s.line}: looks like a real secret (${s.rule}). Real values belong only in .env (git-ignored) or a secret store.`);
    log(`  ${secrets.length ? "FAIL" : "ok  "} secrets scan of added lines`);

    // 3. migrations
    const all = git(["ls-tree", "-r", "--name-only", u.localSha, "--", MIGRATION_DIR]).split(/\r?\n/).filter(Boolean);
    const mig = migrationProblems(changes, all, process.env);
    problems.push(...mig);
    log(`  ${mig.length ? "FAIL" : "ok  "} migrations (immutable once applied, well-formed names)`);

    // 4. which apps need the slower checks
    for (const app of ["backend", "frontend"]) if (changes.some((c) => c.file.startsWith(`${app}/`))) appsToCheck.add(app);
    if (u.localSha !== git(["rev-parse", "HEAD"])) notes.push("You are pushing a commit that is not checked out: app checks below run on your WORKING TREE.");
  }

  // Slow tier: only when the app changed, and only if nothing above already failed.
  if (problems.length === 0) {
    if (git(["status", "--porcelain", "--", "backend", "frontend"]) !== "") notes.push("You have uncommitted changes in backend/ or frontend/: app checks run on your working tree, not only the pushed commits.");
    for (const app of ["backend", "frontend"]) {
      if (!appsToCheck.has(app)) continue;
      const dir = path.join(repoRoot, app);
      if (!existsSync(path.join(dir, "node_modules"))) {
        problems.push(`${app}: dependencies are not installed. Run: cd ${app} && npm ci`);
        continue;
      }
      for (const script of ["lint", "typecheck", "test"]) {
        const r = runStep(dir, script);
        log(`  ${r.ok ? "ok  " : "FAIL"} ${app}: ${script} (${fmt(r.seconds)})`);
        if (!r.ok) {
          problems.push(`${app}: "npm run ${script}" failed. Last output:\n${r.output.trim().split(/\r?\n/).slice(-25).map((l) => `        ${l}`).join("\n")}`);
          break; // fix the first failing step before spending time on the next
        }
      }
    }
    if (appsToCheck.size === 0) log("  skip app checks (no backend/ or frontend/ changes)");
  }

  for (const n of notes) log(`note: ${n}`);
  if (problems.length > 0) {
    console.error("\npre-push: PUSH BLOCKED");
    for (const p of problems) console.error(`  - ${p}`);
    console.error("\nFix the problems above and push again. Emergency only: `git push --no-verify` (CI still runs every check).");
    return 1;
  }
  log(`all checks passed in ${fmt((Date.now() - started) / 1000)}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      // A bug in the hook must not strand the developer: report it and let the push proceed (CI is the backstop).
      console.error(`pre-push: internal error, skipping local checks (CI will still run them): ${err?.message ?? err}`);
      process.exit(0);
    },
  );
}
