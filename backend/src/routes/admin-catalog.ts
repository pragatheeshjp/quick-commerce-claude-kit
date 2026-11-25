import { Router } from "express";
import { validate } from "../middleware/validate.js";
import type { CatalogService } from "../services/catalog.service.js";
import {
  adminListProductsQuery, createCategoryBody, createProductBody, idParams, stockBody,
  updateCategoryBody, updateProductBody,
} from "../validators/catalog.js";

export function createAdminCatalogRouter(service: CatalogService) {
  const router = Router();
  const admin = service.admin;

  router.get("/admin/categories", async (_req, res, next) => {
    try { res.json({ success: true, data: await admin.listCategories() }); } catch (err) { next(err); }
  });

  router.post("/admin/categories", validate({ body: createCategoryBody }), async (req, res, next) => {
    try { res.status(201).json({ success: true, data: await admin.createCategory(req.body) }); } catch (err) { next(err); }
  });

  router.patch("/admin/categories/:id", validate({ params: idParams, body: updateCategoryBody }), async (req, res, next) => {
    try { res.json({ success: true, data: await admin.updateCategory(res.locals.params.id, req.body) }); } catch (err) { next(err); }
  });

  router.get("/admin/products", validate({ query: adminListProductsQuery }), async (_req, res, next) => {
    try {
      const { items, meta } = await admin.listProducts(res.locals.query);
      res.json({ success: true, data: items, meta });
    } catch (err) { next(err); }
  });

  router.get("/admin/products/:id", validate({ params: idParams }), async (_req, res, next) => {
    try { res.json({ success: true, data: await admin.getProduct(res.locals.params.id) }); } catch (err) { next(err); }
  });

  router.post("/admin/products", validate({ body: createProductBody }), async (req, res, next) => {
    try { res.status(201).json({ success: true, data: await admin.createProduct(req.body, req.user!.id) }); } catch (err) { next(err); }
  });

  router.patch("/admin/products/:id", validate({ params: idParams, body: updateProductBody }), async (req, res, next) => {
    try { res.json({ success: true, data: await admin.updateProduct(res.locals.params.id, req.body) }); } catch (err) { next(err); }
  });

  router.post("/admin/products/:id/stock", validate({ params: idParams, body: stockBody }), async (req, res, next) => {
    try {
      const { delta, reason } = req.body;
      res.json({ success: true, data: await admin.adjustStock(res.locals.params.id, delta, reason, req.user!.id) });
    } catch (err) { next(err); }
  });

  return router;
}


