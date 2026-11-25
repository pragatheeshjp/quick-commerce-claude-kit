import { defineConfig } from "vitest/config";

// Live tests run against the real Supabase project in backend/.env (loaded by src/config/env.ts).
// They create and delete their own throwaway users. Needs SUPABASE_ANON_KEY in the environment.
export default defineConfig({
  test: { include: ["tests/live/**/*.test.ts"], env: { LOG_LEVEL: "silent" }, testTimeout: 30_000, hookTimeout: 60_000 },
});
