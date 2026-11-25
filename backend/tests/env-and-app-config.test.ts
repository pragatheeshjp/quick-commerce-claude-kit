import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

// Never read the developer's real backend/.env during these tests.
vi.mock("dotenv/config", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function loadEnv() {
  vi.resetModules();
  return (await import("../src/config/env.js")).env;
}

async function appWith(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  const { createApp } = await import("../src/app.js");
  return createApp({ verifyToken: async () => ({ userId: "u" }), isAdmin: async () => false });
}

describe("environment validation", () => {
  it("applies safe defaults", async () => {
    const env = await loadEnv();
    expect(env.PORT).toBe(4000);
    expect(env.RATE_LIMIT_MAX).toBe(300);
    expect(env.corsOrigins).toEqual(["http://localhost:3000"]);
  });

  it("coerces PORT and RATE_LIMIT_MAX from strings", async () => {
    vi.stubEnv("PORT", "10000");
    vi.stubEnv("RATE_LIMIT_MAX", "50");
    const env = await loadEnv();
    expect(env.PORT).toBe(10000);
    expect(env.RATE_LIMIT_MAX).toBe(50);
  });

  it("splits CORS_ORIGINS on commas, trims, and drops empties", async () => {
    vi.stubEnv("CORS_ORIGINS", " https://a.example , https://b.example,, ");
    expect((await loadEnv()).corsOrigins).toEqual(["https://a.example", "https://b.example"]);
  });

  describe("invalid configuration stops the process with a clear message", () => {
    const failWith = async (env: Record<string, string>) => {
      const exit = vi.spyOn(process, "exit").mockImplementation(((code?: number) => { throw new Error(`exit:${code}`); }) as never);
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      await expect(loadEnv()).rejects.toThrow("exit:1");
      expect(exit).toHaveBeenCalledWith(1);
      return JSON.stringify(log.mock.calls);
    };

    it.each([
      ["a missing/invalid SUPABASE_URL", { SUPABASE_URL: "not-a-url" }],
      ["a non-numeric PORT", { PORT: "abc" }],
      ["a negative PORT", { PORT: "-1" }],
      ["an unknown NODE_ENV", { NODE_ENV: "staging" }],
      ["an unknown LOG_LEVEL", { LOG_LEVEL: "loud" }],
      ["a too-short service-role key", { SUPABASE_SERVICE_ROLE_KEY: "short" }],
    ])("rejects %s", async (_label, env) => {
      const output = await failWith(env);
      expect(output).toContain("Invalid environment configuration");
    });

    it("never prints secret values while reporting the problem", async () => {
      const output = await failWith({ SUPABASE_SERVICE_ROLE_KEY: "tiny-key-secret" });
      expect(output).not.toContain("tiny-key-secret");
    });
  });
});

describe("app configuration", () => {
  it("allows the configured frontend origin and no other (CORS allowlist)", async () => {
    const app = await appWith({ CORS_ORIGINS: "https://shop.example, https://admin.example" });
    for (const origin of ["https://shop.example", "https://admin.example"]) {
      expect((await request(app).get("/api/v1/health").set("Origin", origin)).headers["access-control-allow-origin"]).toBe(origin);
    }
    for (const origin of ["https://evil.example", "http://shop.example", "https://shop.example.evil.example"]) {
      expect((await request(app).get("/api/v1/health").set("Origin", origin)).headers["access-control-allow-origin"]).toBeUndefined();
    }
  });

  it("serves non-browser clients (no Origin header)", async () => {
    expect((await request(await appWith()).get("/api/v1/health")).status).toBe(200);
  });

  it("answers preflight for the custom headers and methods the frontend uses, only for allowed origins", async () => {
    const app = await appWith();
    const pre = await request(app).options("/api/v1/orders").set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "POST").set("Access-Control-Request-Headers", "authorization,content-type,idempotency-key");
    expect(pre.status).toBe(204);
    expect(pre.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(pre.headers["access-control-allow-headers"]?.toLowerCase()).toContain("idempotency-key");
    for (const m of ["PUT", "PATCH", "DELETE"]) expect(pre.headers["access-control-allow-methods"]).toContain(m);

    const bad = await request(app).options("/api/v1/orders").set("Origin", "https://evil.example").set("Access-Control-Request-Method", "POST");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sets security headers and hides the framework", async () => {
    const res = await request(await appWith()).get("/api/v1/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });

  it("rejects oversized JSON bodies with a 413 JSON error", async () => {
    const res = await request(await appWith()).post("/api/v1/orders").set("Content-Type", "application/json")
      .send(JSON.stringify({ pad: "x".repeat(150_000) }));
    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
  });

  it("trusts exactly one proxy hop in production (correct client IPs behind Render), none otherwise", async () => {
    expect((await appWith({ NODE_ENV: "production" })).get("trust proxy")).toBe(1);
    expect((await appWith({ NODE_ENV: "test" })).get("trust proxy")).toBeFalsy();
  });

  it("rate limits per client and reports the limit", async () => {
    const app = await appWith({ RATE_LIMIT_MAX: "3" });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await request(app).get("/api/v1/health")).status);
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    const limited = await request(app).get("/api/v1/health");
    expect(Object.keys(limited.headers).some((h) => h.startsWith("ratelimit"))).toBe(true);
  });
});
