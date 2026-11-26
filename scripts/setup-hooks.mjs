// Enables the repo's git hooks for THIS clone by pointing core.hooksPath at the tracked .githooks/ folder.
//
// Runs automatically from the `prepare` script of backend/ and frontend/ (so `npm install` / `npm ci` enables it),
// and can be run by hand:  node scripts/setup-hooks.mjs [--status]
//
// Safety rules (this must NEVER break an install, a Docker build, CI or a deploy):
//  - always exits 0, even on errors
//  - does nothing in CI / Render / Vercel, outside a git checkout, or if .githooks/ is missing
//  - never overwrites a core.hooksPath the developer already set to something else
//  - makes no network calls; the only change is one local git config value
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS_DIR = ".githooks";
const statusOnly = process.argv.includes("--status");
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const git = (args) =>
  execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const sameDir = (a, b) => realpathSync(a).toLowerCase() === realpathSync(b).toLowerCase();

try {
  const skip = process.env.CI || process.env.RENDER || process.env.VERCEL || process.env.SKIP_GIT_HOOKS;
  if (!statusOnly && skip) process.exit(0);
  if (!existsSync(path.join(repoRoot, HOOKS_DIR, "pre-push"))) process.exit(0);
  if (!sameDir(git(["rev-parse", "--show-toplevel"]), repoRoot)) process.exit(0); // not this repo's own checkout

  let current = "";
  try {
    current = git(["config", "--local", "--get", "core.hooksPath"]);
  } catch {
    /* not set */
  }

  if (statusOnly) {
    console.log(
      current === HOOKS_DIR
        ? `[hooks] ENABLED: core.hooksPath = ${HOOKS_DIR} (pre-push runs on git push)`
        : `[hooks] NOT enabled (core.hooksPath = ${current || "unset"}). Run: node scripts/setup-hooks.mjs`,
    );
    process.exit(0);
  }

  if (current === HOOKS_DIR) process.exit(0); // already enabled, stay quiet
  if (current) {
    console.log(`[hooks] core.hooksPath is already set to "${current}"; leaving it alone (pre-push hook NOT enabled).`);
    process.exit(0);
  }
  git(["config", "--local", "core.hooksPath", HOOKS_DIR]);
  console.log(`[hooks] enabled ${HOOKS_DIR}/ for this clone (pre-push checks run on git push; skip once with --no-verify)`);
} catch {
  // Never fail the install because of git hooks.
}
process.exit(0);
