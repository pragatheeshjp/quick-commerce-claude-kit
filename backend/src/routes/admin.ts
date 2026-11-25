import { Router } from "express";

/** Admin-only endpoints. Auth + admin role are enforced once, where this router is mounted. */
export function createAdminRouter() {
  const router = Router();
  router.get("/admin/ping", (_req, res) => {
    res.json({ success: true, data: { admin: true } });
  });
  return router;
}
