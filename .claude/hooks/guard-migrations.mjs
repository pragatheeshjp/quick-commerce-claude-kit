// PreToolUse hook (Edit|Write): applied Supabase migrations are immutable.
//
// Editing a migration that has already been applied does NOT change the database (the CLI tracks migrations by
// version, not content), so the repo and the database silently drift apart. Schema changes must be a NEW migration.
//
// Behaviour: if the target is an EXISTING file under supabase/migrations/, ask the user to confirm (they may be
// fixing a migration that was never applied). Creating a brand-new migration file is always allowed.
import { existsSync } from "node:fs";

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
const isMigration = /(^|\/)supabase\/migrations\/[^/]+\.sql$/i.test(filePath);

if (isMigration && existsSync(input.tool_input.file_path)) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason:
          "This edits an EXISTING migration. Applied migrations must not change (the database will not pick up the edit). " +
          "Create a new migration file for schema changes. Continue only if this migration has never been applied.",
      },
    }),
  );
}
process.exit(0);
