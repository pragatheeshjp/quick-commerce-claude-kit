import { Router } from "express";
import { env } from "../config/env.js";
import type { AuthDeps } from "../middleware/auth.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import type { CatalogRepository } from "../repositories/catalog.repository.js";
import { supabaseCatalogRepository } from "../repositories/catalog.repository.js";
import type { AddressRepository } from "../repositories/address.repository.js";
import { supabaseAddressRepository } from "../repositories/address.repository.js";
import type { CartRepository } from "../repositories/cart.repository.js";
import { supabaseCartRepository } from "../repositories/cart.repository.js";
import type { AdminUsersRepository } from "../repositories/admin-users.repository.js";
import { supabaseAdminUsersRepository } from "../repositories/admin-users.repository.js";
import type { OrderRepository } from "../repositories/order.repository.js";
import { supabaseOrderRepository } from "../repositories/order.repository.js";
import { createCatalogService } from "../services/catalog.service.js";
import { createOrderService } from "../services/order.service.js";
import { createAddressService, createCartService } from "../services/commerce.service.js";
import { createAdminCatalogRouter } from "./admin-catalog.js";
import { createAddressesRouter, createServiceabilityRouter } from "./addresses.js";
import { createAdminOrdersRouter } from "./admin-orders.js";
import { createAdminUsersRouter } from "./admin-users.js";
import { createAdminRouter } from "./admin.js";
import { createCartRouter } from "./cart.js";
import { createCatalogRouter } from "./catalog.js";
import { healthRouter } from "./health.js";
import { createMeRouter } from "./me.js";
import { createOrdersRouter } from "./orders.js";

export type ApiDeps = AuthDeps & {
  catalog?: CatalogRepository;
  addresses?: AddressRepository;
  cart?: CartRepository;
  orders?: OrderRepository;
  adminUsers?: AdminUsersRepository;
};

export function createApiRouter(deps: ApiDeps) {
  const { requireAuth, requireAdmin } = createAuthMiddleware(deps);
  const catalog = createCatalogService(
    deps.catalog ?? supabaseCatalogRepository,
    `${env.SUPABASE_URL}/storage/v1/object/public`,
  );
  const storageBaseUrl = `${env.SUPABASE_URL}/storage/v1/object/public`;
  const addresses = createAddressService(deps.addresses ?? supabaseAddressRepository);
  const cart = createCartService(deps.cart ?? supabaseCartRepository, storageBaseUrl);
  const orders = createOrderService(deps.orders ?? supabaseOrderRepository);
  const router = Router();
  router.use(healthRouter);
  router.use(createMeRouter(requireAuth, deps));
  router.use(createCatalogRouter(catalog));
  router.use(createServiceabilityRouter(addresses));
  router.use("/addresses", requireAuth, createAddressesRouter(addresses));
  router.use("/cart", requireAuth, createCartRouter(cart));
  router.use(["/checkout", "/orders"], requireAuth);
  router.use(createOrdersRouter(orders));
  // Everything under /admin requires a verified admin; checked once here for all admin routers.
  router.use("/admin", requireAuth, requireAdmin);
  router.use(createAdminRouter());
  router.use(createAdminCatalogRouter(catalog));
  router.use(createAdminOrdersRouter(orders));
  router.use(createAdminUsersRouter(deps.adminUsers ?? supabaseAdminUsersRepository));
  return router;
}




