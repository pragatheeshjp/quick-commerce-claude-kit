import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env.js";

const issuer = `${env.SUPABASE_URL}/auth/v1`;
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

export interface VerifiedToken {
  userId: string;
  email?: string;
}

/** Verifies signature (via Supabase JWKS), issuer, audience and expiry. Throws on failure. */
export async function verifyAccessToken(token: string): Promise<VerifiedToken> {
  const { payload } = await jwtVerify(token, jwks, { issuer, audience: "authenticated" });
  if (!payload.sub) throw new Error("Token has no subject");
  return { userId: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
}
