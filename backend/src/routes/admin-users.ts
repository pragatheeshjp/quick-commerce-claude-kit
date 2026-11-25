import { Router } from "express";
import { AppError, notFoundError } from "../lib/errors.js";
import { validate } from "../middleware/validate.js";
import type { AdminUsersRepository } from "../repositories/admin-users.repository.js";
import { grantAdminBody, userIdParams } from "../validators/admin.js";

/** Mounted under /admin behind requireAuth + requireAdmin. */
export function createAdminUsersRouter(repo: AdminUsersRepository) {
  const router = Router();

  router.get("/admin/admins", async (_req, res, next) => {
    try { res.json({ success: true, data: await repo.list() }); } catch (err) { next(err); }
  });

  router.post("/admin/admins", validate({ body: grantAdminBody }), async (req, res, next) => {
    try {
      const userId = await repo.findUserIdByEmail(req.body.email);
      if (!userId) {
        throw new AppError(404, "USER_NOT_FOUND", "No account exists for that email. Ask them to sign up first.");
      }
      await repo.grant(userId); // idempotent
      res.status(201).json({ success: true, data: { user_id: userId, email: req.body.email } });
    } catch (err) { next(err); }
  });

  router.delete("/admin/admins/:userId", validate({ params: userIdParams }), async (req, res, next) => {
    try {
      const removed = await repo.revoke(res.locals.params.userId, req.user!.id);
      if (!removed) throw notFoundError("That user is not an admin");
      res.status(204).end();
    } catch (err) { next(err); }
  });

  return router;
}
