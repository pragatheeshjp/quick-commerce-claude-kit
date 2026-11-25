import { Router } from "express";
import { validate } from "../middleware/validate.js";
import type { CartService } from "../services/commerce.service.js";
import { cartItemParams, setQuantityBody } from "../validators/commerce.js";

/** Mounted under /cart behind requireAuth. */
export function createCartRouter(service: CartService) {
  const router = Router();
  router.get("/", async (req, res, next) => {
    try { res.json({ success: true, data: await service.view(req.user!.id) }); } catch (err) { next(err); }
  });
  router.put("/items/:productId", validate({ params: cartItemParams, body: setQuantityBody }), async (req, res, next) => {
    try {
      res.json({ success: true, data: await service.setQuantity(req.user!.id, res.locals.params.productId, req.body.quantity) });
    } catch (err) { next(err); }
  });
  router.delete("/items/:productId", validate({ params: cartItemParams }), async (req, res, next) => {
    try { res.json({ success: true, data: await service.removeItem(req.user!.id, res.locals.params.productId) }); } catch (err) { next(err); }
  });
  router.delete("/", async (req, res, next) => {
    try { res.json({ success: true, data: await service.clear(req.user!.id) }); } catch (err) { next(err); }
  });
  return router;
}
