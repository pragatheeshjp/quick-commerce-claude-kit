import { Router } from "express";
import { validate } from "../middleware/validate.js";
import type { AddressService } from "../services/commerce.service.js";
import { createAddressBody, pincodeParams, updateAddressBody } from "../validators/commerce.js";
import { idParams } from "../validators/catalog.js";

export function createServiceabilityRouter(service: AddressService) {
  const router = Router();
  router.get("/serviceability/:pincode", validate({ params: pincodeParams }), async (_req, res, next) => {
    try { res.json({ success: true, data: await service.serviceability(res.locals.params.pincode) }); } catch (err) { next(err); }
  });
  return router;
}

/** Mounted under /addresses behind requireAuth. The user id always comes from the verified token. */
export function createAddressesRouter(service: AddressService) {
  const router = Router();
  router.get("/", async (req, res, next) => {
    try { res.json({ success: true, data: await service.list(req.user!.id) }); } catch (err) { next(err); }
  });
  router.post("/", validate({ body: createAddressBody }), async (req, res, next) => {
    try { res.status(201).json({ success: true, data: await service.create(req.user!.id, req.body) }); } catch (err) { next(err); }
  });
  router.patch("/:id", validate({ params: idParams, body: updateAddressBody }), async (req, res, next) => {
    try { res.json({ success: true, data: await service.update(req.user!.id, res.locals.params.id, req.body) }); } catch (err) { next(err); }
  });
  router.delete("/:id", validate({ params: idParams }), async (req, res, next) => {
    try { await service.remove(req.user!.id, res.locals.params.id); res.status(204).end(); } catch (err) { next(err); }
  });
  return router;
}
