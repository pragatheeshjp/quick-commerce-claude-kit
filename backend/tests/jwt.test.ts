import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

// verifyAccessToken builds a remote JWKS at import time. Replace that with a local key set we control, so the
// real jose verification (signature, issuer, audience, expiry, algorithm) is exercised without any network.
const holder = vi.hoisted(() => ({ jwks: undefined as unknown as (h: unknown, t: unknown) => Promise<unknown> }));
vi.mock("jose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jose")>();
  return { ...actual, createRemoteJWKSet: () => (h: unknown, t: unknown) => holder.jwks(h, t) };
});

import { verifyAccessToken } from "../src/lib/jwt.js";

const ISSUER = "https://test-project.supabase.co/auth/v1";
let priv: CryptoKey;
let otherPriv: CryptoKey;

async function sign(opts: { sub?: string | null; email?: string; iss?: string; aud?: string; exp?: string | number; key?: CryptoKey; kid?: string; alg?: string } = {}) {
  const jwt = new SignJWT(opts.email ? { email: opts.email } : {})
    .setProtectedHeader({ alg: opts.alg ?? "ES256", kid: opts.kid ?? "k1" })
    .setIssuer(opts.iss ?? ISSUER)
    .setAudience(opts.aud ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? "1h");
  if (opts.sub !== null) jwt.setSubject(opts.sub ?? "user-1");
  return jwt.sign(opts.key ?? priv);
}

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  const other = await generateKeyPair("ES256");
  priv = pair.privateKey;
  otherPriv = other.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  holder.jwks = createLocalJWKSet({ keys: [jwk] }) as unknown as typeof holder.jwks;
});

describe("verifyAccessToken", () => {
  it("accepts a valid Supabase token and returns the user id and email", async () => {
    await expect(verifyAccessToken(await sign({ email: "a@example.com" }))).resolves.toEqual({ userId: "user-1", email: "a@example.com" });
  });

  it("works without an email claim", async () => {
    await expect(verifyAccessToken(await sign())).resolves.toEqual({ userId: "user-1", email: undefined });
  });

  it("rejects an expired token", async () => {
    const expired = await sign({ exp: Math.floor(Date.now() / 1000) - 120 });
    await expect(verifyAccessToken(expired)).rejects.toThrow();
  });

  it("rejects a token from another issuer", async () => {
    await expect(verifyAccessToken(await sign({ iss: "https://evil.example/auth/v1" }))).rejects.toThrow();
  });

  it("rejects the wrong audience (e.g. an anon-role token)", async () => {
    await expect(verifyAccessToken(await sign({ aud: "anon" }))).rejects.toThrow();
  });

  it("rejects a token signed by a different key even if it claims the trusted kid", async () => {
    await expect(verifyAccessToken(await sign({ key: otherPriv }))).rejects.toThrow();
  });

  it("rejects an unknown key id", async () => {
    await expect(verifyAccessToken(await sign({ kid: "not-in-jwks" }))).rejects.toThrow();
  });

  it("rejects a token without a subject", async () => {
    await expect(verifyAccessToken(await sign({ sub: null }))).rejects.toThrow(/subject/i);
  });

  it("rejects a tampered payload", async () => {
    const [h, , s] = (await sign()).split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "admin-user", aud: "authenticated", iss: ISSUER, exp: 9999999999 })).toString("base64url");
    await expect(verifyAccessToken(`${h}.${forgedPayload}.${s}`)).rejects.toThrow();
  });

  it("rejects an unsigned (alg: none) token", async () => {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const unsigned = `${enc({ alg: "none", typ: "JWT" })}.${enc({ sub: "u", aud: "authenticated", iss: ISSUER, exp: 9999999999 })}.`;
    await expect(verifyAccessToken(unsigned)).rejects.toThrow();
  });

  it("rejects an HS256 token (algorithm-confusion attempt)", async () => {
    const hs = await new SignJWT({}).setProtectedHeader({ alg: "HS256", kid: "k1" }).setSubject("u").setIssuer(ISSUER)
      .setAudience("authenticated").setExpirationTime("1h").sign(new TextEncoder().encode("a-shared-secret-of-sufficient-length-1234"));
    await expect(verifyAccessToken(hs)).rejects.toThrow();
  });

  it("rejects garbage", async () => {
    for (const bad of ["", "abc", "a.b.c", "Bearer x"]) await expect(verifyAccessToken(bad)).rejects.toThrow();
  });
});
