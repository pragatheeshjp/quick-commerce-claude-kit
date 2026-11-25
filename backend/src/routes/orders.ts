import { Router } from "express";
import { validate } from "../middleware/validate.js";
import type { OrderService } from "../services/order.service.js";
import { idParams } from "../validators/catalog.js";
import { checkoutBody, idempotencyKey, listOrdersQuery } from "../validators/orders.js";

/** Mounted behind requireAuth. The user always comes from the verified token. */
export function createOrdersRouter(service: OrderService) {
  const router = Router();

  router.post("/checkout/quote", validate({ body: checkoutBody }), async (req, res, next) => {
    try { res.json({ success: true, data: await service.quote(req.user!.id, req.body) }); } catch (err) { next(err); }
  });

  router.post("/orders", validate({ body: checkoutBody }), async (req, res, next) => {
    try {
      const key = idempotencyKey.parse(req.header("Idempotency-Key"));
      const { order, replayed } = await service.placeOrder(req.user!.id, key, req.body);
      res.status(replayed ? 200 : 201).json({ success: true, data: order, meta: { replayed } });
    } catch (err) { next(err); }
  });

  router.get("/orders", validate({ query: listOrdersQuery }), async (req, res, next) => {
    try {
      const { page, pageSize } = res.locals.query;
      const { items, meta } = await service.list(req.user!.id, page, pageSize);
      res.json({ success: true, data: items, meta });
    } catch (err) { next(err); }
  });

  router.get("/orders/:id", validate({ params: idParams }), async (req, res, next) => {
    try { res.json({ success: true, data: await service.get(req.user!.id, res.locals.params.id) }); } catch (err) { next(err); }
  });

  router.post("/orders/:id/cancel", validate({ params: idParams }), async (req, res, next) => {
    try { res.json({ success: true, data: await service.cancel(req.user!.id, res.locals.params.id) }); } catch (err) { next(err); }
  });

  return router;
}
