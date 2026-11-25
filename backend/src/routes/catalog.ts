import { Router } from "express";
import { validate } from "../middleware/validate.js";
import type { CatalogService } from "../services/catalog.service.js";
import { idParams, listProductsQuery } from "../validators/catalog.js";

export function createCatalogRouter(service: CatalogService) {
  const router = Router();

  router.get("/categories", async (_req, res, next) => {
    try {
      res.json({ success: true, data: await service.listCategories() });
    } catch (err) { next(err); }
  });

  router.get("/products", validate({ query: listProductsQuery }), async (_req, res, next) => {
    try {
      const { items, meta } = await service.listProducts(res.locals.query);
      res.json({ success: true, data: items, meta });
    } catch (err) { next(err); }
  });

  router.get("/products/:id", validate({ params: idParams }), async (_req, res, next) => {
    try {
      res.json({ success: true, data: await service.getProduct(res.locals.params.id) });
    } catch (err) { next(err); }
  });

  return router;
}
