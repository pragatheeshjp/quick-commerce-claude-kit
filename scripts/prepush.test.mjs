// Unit tests for the pure logic in scripts/prepush.mjs.  Run: node --test scripts/prepush.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { isProtectedRef, migrationProblems, parseNameStatus, protectedBranchProblem, scanAddedLines, ZERO_SHA } from "./prepush.mjs";

// Secret-shaped strings are assembled at runtime so this file contains no secret-like literals
// (otherwise the hook and the CI hygiene scan would flag the test file itself).
const fakeSbSecret = () => "sb_" + "secret_" + "AbCdEfGhIjKlMnOpQrSt1234";
const fakeJwt = () => ["eyJ" + "hbGciOiJIUzI1NiJ9", "eyJ" + "yb2xlIjoic2VydmljZSJ9", "abcdefghijklmnopqrstuvwxyz0123"].join(".");
const REAL_LOOKING = "Zk3Qp9Lw7Xv2Nb8Ty5Rm1Hc6Jd4Gs0Af";
const diffFor = (file, ...added) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1,0 +5,${added.length} @@\n${added.map((l) => `+${l}`).join("\n")}\n`;

test("parseNameStatus reads added/modified/deleted entries", () => {
  assert.deepEqual(parseNameStatus("A\tbackend/a.ts\nM\tdocs/x.md\nD\told file.ts\n"), [
    { status: "A", file: "backend/a.ts" },
    { status: "M", file: "docs/x.md" },
    { status: "D", file: "old file.ts" },
  ]);
  assert.deepEqual(parseNameStatus(""), []);
});

test("protected branches: only main and master", () => {
  assert.equal(isProtectedRef("refs/heads/main"), true);
  assert.equal(isProtectedRef("refs/heads/master"), true);
  assert.equal(isProtectedRef("refs/heads/feature/main"), false);
  assert.equal(isProtectedRef("refs/tags/main"), false);
});

test("direct pushes to main are blocked, but creating it and feature branches are allowed", () => {
  const sha = "a".repeat(40);
  const push = (remoteRef, remoteSha, localSha = sha) => ({ remoteRef, remoteSha, localSha });
  assert.match(protectedBranchProblem(push("refs/heads/main", "b".repeat(40))), /Direct pushes to "main" are blocked/);
  assert.equal(protectedBranchProblem(push("refs/heads/main", ZERO_SHA)), null, "first push into an empty repo");
  assert.equal(protectedBranchProblem(push("refs/heads/feature/x", "b".repeat(40))), null);
  assert.equal(protectedBranchProblem(push("refs/heads/main", "b".repeat(40)), { ALLOW_PUSH_TO_MAIN: "1" }), null);
  assert.match(protectedBranchProblem(push("refs/heads/main", "b".repeat(40), ZERO_SHA)), /Deleting "main"/);
  assert.match(protectedBranchProblem(push("refs/heads/main", "b".repeat(40), ZERO_SHA), { ALLOW_PUSH_TO_MAIN: "1" }), /Deleting/);
  assert.equal(protectedBranchProblem(push("refs/heads/feature/x", "b".repeat(40), ZERO_SHA)), null, "deleting a feature branch is fine");
});

test("secrets in added lines are found, with file and line number", () => {
  const hits = scanAddedLines(diffFor("docs/a.md", "hello", `key: ${fakeSbSecret()}`));
  assert.equal(hits.length, 1);
  assert.equal(hits[0].file, "docs/a.md");
  assert.equal(hits[0].line, 6); // hunk starts at 5, the secret is the second added line
  assert.match(hits[0].rule, /sb_secret/);
  assert.equal(scanAddedLines(diffFor("backend/src/x.ts", `const k = "${fakeJwt()}";`)).length, 1);
  assert.equal(scanAddedLines(diffFor("docs/d.md", `SUPABASE_DB_PASSWORD: ${REAL_LOOKING}`)).length, 1);
  assert.equal(scanAddedLines(diffFor("backend/.env.example", `SUPABASE_SERVICE_ROLE_KEY=${REAL_LOOKING}`)).length, 1);
});

test("placeholders, short values, references and ordinary code are not flagged", () => {
  const clean = [
    "SUPABASE_SERVICE_ROLE_KEY=replace-me",
    'SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-not-real-0000"',
    "SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}",
    "Set SUPABASE_SERVICE_ROLE_KEY in Render. Never commit it.",
    "DB_PASSWORD=hunter2",
    "export const add = (a, b) => a + b;",
  ];
  for (const line of clean) assert.equal(scanAddedLines(diffFor("docs/x.md", line)).length, 0, line);
});

test("only ADDED lines count: removed lines and deleted files are ignored", () => {
  const removed = `diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -3,1 +3,0 @@\n-${fakeSbSecret()}\n`;
  assert.equal(scanAddedLines(removed).length, 0);
  const deletedFile = `diff --git a/x b/x\n--- a/x\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-${fakeSbSecret()}\n`;
  assert.equal(scanAddedLines(deletedFile).length, 0);
});

test("one finding per file and rule, even if repeated", () => {
  assert.equal(scanAddedLines(diffFor("a.md", fakeSbSecret(), fakeSbSecret())).length, 1);
});

test("migrations: new well-named files are fine; editing, deleting or misnaming is not", () => {
  const all = ["supabase/migrations/20261122000001_init.sql", "supabase/migrations/20261201000001_new_thing.sql"];
  assert.deepEqual(migrationProblems([{ status: "A", file: "supabase/migrations/20261201000001_new_thing.sql" }], all), []);
  assert.match(migrationProblems([{ status: "M", file: "supabase/migrations/20261122000001_init.sql" }], all)[0], /immutable/);
  assert.match(migrationProblems([{ status: "D", file: "supabase/migrations/20261122000001_init.sql" }], all)[0], /deleted/);
  assert.match(migrationProblems([{ status: "A", file: "supabase/migrations/new thing.sql" }], all)[0], /must be named/);
  assert.deepEqual(migrationProblems([{ status: "M", file: "supabase/migrations/20261122000001_init.sql" }], all, { ALLOW_MIGRATION_EDIT: "1" }), []);
  assert.deepEqual(migrationProblems([{ status: "M", file: "backend/src/app.ts" }], all), [], "non-migration files are ignored");
});

test("duplicate migration timestamps are reported", () => {
  const dupes = ["supabase/migrations/20261122000001_a.sql", "supabase/migrations/20261122000001_b.sql"];
  assert.match(migrationProblems([], dupes)[0], /Duplicate migration timestamp 20261122000001/);
});
