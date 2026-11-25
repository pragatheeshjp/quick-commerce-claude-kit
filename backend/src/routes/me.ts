import { Router } from "express";
import type { RequestHandler } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export interface MeDeps {
  isAdmin: (userId: string) => Promise<boolean>;
}

export function createMeRouter(requireAuth: RequestHandler, deps: MeDeps) {
  const router = Router();

  router.get("/me", requireAuth, async (req, res, next) => {
    try {
      const user = req.user!;
      const [admin, profile] = await Promise.all([
        deps.isAdmin(user.id),
        supabaseAdmin.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
      ]);
      if (profile.error) throw profile.error;
      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          role: admin ? "admin" : "customer",
          profile: profile.data,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
