import { notFoundError } from "../lib/errors.js";
import type { CatalogRepository } from "../repositories/catalog.repository.js";
import type { ProductFilter, ProductRow } from "../types/catalog.js";

type ListQuery = { category?: string; q?: string; page: number; pageSize: number };

export function createCatalogService(repo: CatalogRepository, storageBaseUrl: string) {
  const imageUrl = (path: string | null) => (path ? `${storageBaseUrl}/product-images/${path}` : null);

  // Customers never see raw stock counts or inactive flags - only whether the item can be bought.
  const toPublic = (p: ProductRow) => ({
    id: p.id,
    category_id: p.category_id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    brand: p.brand,
    unit_label: p.unit_label,
    price_paise: p.price_paise,
    mrp_paise: p.mrp_paise,
    in_stock: p.stock_quantity > 0,
    image_url: imageUrl(p.image_path),
  });
  const toAdmin = (p: ProductRow) => ({ ...p, image_url: imageUrl(p.image_path) });

  const filter = (q: ListQuery, includeInactive: boolean): ProductFilter => ({
    categorySlug: q.category, q: q.q, page: q.page, pageSize: q.pageSize, includeInactive,
  });
  const meta = (q: ListQuery, total: number) => ({ page: q.page, pageSize: q.pageSize, total });

  return {
    listCategories: () => repo.listCategories(false),

    async listProducts(q: ListQuery) {
      const { items, total } = await repo.listProducts(filter(q, false));
      return { items: items.map(toPublic), meta: meta(q, total) };
    },

    async getProduct(id: string) {
      const p = await repo.getProduct(id, false);
      if (!p) throw notFoundError("Product not found");
      return toPublic(p);
    },

    admin: {
      listCategories: () => repo.listCategories(true),
      createCategory: (input: Parameters<CatalogRepository["createCategory"]>[0]) => repo.createCategory(input),
      updateCategory: (id: string, patch: Parameters<CatalogRepository["updateCategory"]>[1]) =>
        repo.updateCategory(id, patch),

      async listProducts(q: ListQuery & { includeInactive: boolean }) {
        const { items, total } = await repo.listProducts(filter(q, q.includeInactive));
        return { items: items.map(toAdmin), meta: meta(q, total) };
      },

      async getProduct(id: string) {
        const p = await repo.getProduct(id, true);
        if (!p) throw notFoundError("Product not found");
        return toAdmin(p);
      },

      async createProduct(input: Record<string, unknown> & { initial_stock?: number }, actorId: string) {
        const { initial_stock, ...fields } = input;
        const p = await repo.createProduct({ ...fields, stock_quantity: initial_stock ?? 0 }, actorId);
        return toAdmin(p);
      },

      async updateProduct(id: string, patch: Partial<ProductRow>) {
        return toAdmin(await repo.updateProduct(id, patch));
      },

      async adjustStock(id: string, delta: number, reason: "restock" | "adjustment", actorId: string) {
        const stock_quantity = await repo.adjustStock(id, delta, reason, actorId);
        return { id, stock_quantity };
      },
    },
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;

