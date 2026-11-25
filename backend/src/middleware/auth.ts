import type { RequestHandler } from "express";
import { forbidden, unauthorized } from "../lib/errors.js";
import type { VerifiedToken } from "../lib/jwt.js";

export interface AuthDeps {
  verifyToken: (token: string) => Promise<VerifiedToken>;
  isAdmin: (userId: string) => Promise<boolean>;
}

export function createAuthMiddleware(deps: AuthDeps) {
  /** Requires a valid Supabase access token. The user id comes from the verified token only. */
  const requireAuth: RequestHandler = async (req, _res, next) => {
    const header = req.headers.authorization;
    const match = header && /^Bearer (.+)$/.exec(header);
    if (!match?.[1]) return next(unauthorized());
    try {
      const { userId, email } = await deps.verifyToken(match[1]);
      req.user = { id: userId, email };
      next();
    } catch {
      next(unauthorized("Invalid or expired token"));
    }
  };

  /** Must run after requireAuth. Role is looked up server-side, never taken from the client. */
  const requireAdmin: RequestHandler = async (req, _res, next) => {
    try {
      if (!req.user) return next(unauthorized());
      if (!(await deps.isAdmin(req.user.id))) return next(forbidden("Admin access required"));
      next();
    } catch (err) {
      next(err);
    }
  };

  return { requireAuth, requireAdmin };
}
