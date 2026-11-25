import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Live tests hit the real Supabase project; run them explicitly with `npm run test:live`.
    exclude: ["tests/live/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**"],
      // server.ts only calls listen(); types are compile-time only.
      exclude: ["src/server.ts", "src/types/**"],
    },
    // Dummy values so config validation passes; unit tests never reach Supabase.
    env: {
      LOG_LEVEL: "silent",
      SUPABASE_URL: "https://test-project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key-not-real-0000",
    },
  },
});
