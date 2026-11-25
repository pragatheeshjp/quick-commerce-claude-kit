import { Router } from "express";
import { validate } from "../middleware/validate.js";
import type { OrderService } from "../services/order.service.js";
import { idParams } from "../validators/catalog.js";
import { adminListOrdersQuery, changeStatusBody } from "../validators/orders.js";

/** Mounted under /admin behind requireAuth + requireAdmin. */
export function createAdminOrdersRouter(service: OrderService) {
  const router = Router();
  const admin = service.admin;

  router.get("/admin/orders", validate({ query: adminListOrdersQuery }), async (_req, res, next) => {
    try {
      const { status, page, pageSize } = res.locals.query;
      const { items, meta } = await admin.list(status, page, pageSize);
      res.json({ success: true, data: items, meta });
    } catch (err) { next(err); }
  });

  router.get("/admin/orders/:id", validate({ params: idParams }), async (_req, res, next) => {
    try { res.json({ success: true, data: await admin.get(res.locals.params.id) }); } catch (err) { next(err); }
  });

  router.patch("/admin/orders/:id/status", validate({ params: idParams, body: changeStatusBody }), async (req, res, next) => {
    try { res.json({ success: true, data: await admin.changeStatus(res.locals.params.id, req.body.status) }); } catch (err) { next(err); }
  });

  return router;
}
