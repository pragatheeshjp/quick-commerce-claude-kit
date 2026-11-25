// PreToolUse hook (Edit|Write): refuse to write real-looking secrets into files that would be committed.
//
// Allowed targets for real values: .env and .env.local (both git-ignored). Everything else (source, docs,
// workflows, .env.example, ...) is blocked if the new content looks like a Supabase secret key, access token,
// JWT, or a *_KEY/*_PASSWORD/*_TOKEN assignment with a long value that is not an obvious placeholder.
let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0); // never block on a malformed payload
}

const filePath = String(input?.tool_input?.file_path ?? "").replaceAll("\\", "/");
const base = filePath.split("/").pop() ?? "";

// Git-ignored files where real values legitimately live.
if (base === ".env" || base === ".env.local" || /\/node_modules\//.test(filePath)) process.exit(0);

const content = String(input?.tool_input?.content ?? input?.tool_input?.new_string ?? "");

const PLACEHOLDER = /(test|placeholder|not-real|not_real|example|replace|change-?me|your-|xxx|dummy|fake|sample)/i;

const rules = [
  { name: "Supabase secret key (sb_secret_...)", re: /sb_secret_[A-Za-z0-9_-]{16,}/g },
  { name: "Supabase access token (sbp_...)", re: /sbp_[A-Za-z0-9]{30,}/g },
  { name: "JWT (service-role / anon keys are JWTs)", re: /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/g },
  {
    name: "secret-looking assignment (KEY / SECRET / PASSWORD / TOKEN)",
    re: /\b[A-Z][A-Z0-9_]*(?:SERVICE_ROLE_KEY|SECRET_KEY|SECRET|PASSWORD|ACCESS_TOKEN|API_KEY)\b\s*[=:]\s*["']?([A-Za-z0-9._\-/+]{20,})/g,
    valueGroup: 1,
  },
];

const hits = [];
for (const rule of rules) {
  for (const m of content.matchAll(rule.re)) {
    const value = rule.valueGroup ? m[rule.valueGroup] : m[0];
    if (PLACEHOLDER.test(value)) continue;
    hits.push(rule.name);
    break;
  }
}

if (hits.length > 0) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `Blocked: this write to ${base || filePath} contains what looks like a real secret (${hits.join("; ")}). ` +
          "Real values belong only in backend/.env or frontend/.env (git-ignored) or in a secret store (Render / GitHub Secrets). " +
          "Use an obvious placeholder (e.g. replace-me) in committed files.",
      },
    }),
  );
}
process.exit(0);
