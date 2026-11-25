import type { PostgrestError } from "@supabase/supabase-js";
import { AppError, badRequest, conflict, notFoundError } from "../lib/errors.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { Category, ProductFilter, ProductRow } from "../types/catalog.js";

export interface CatalogRepository {
  listCategories(includeInactive: boolean): Promise<Category[]>;
  createCategory(input: Partial<Category>): Promise<Category>;
  updateCategory(id: string, patch: Partial<Category>): Promise<Category>;
  listProducts(filter: ProductFilter): Promise<{ items: ProductRow[]; total: number }>;
  getProduct(id: string, includeInactive: boolean): Promise<ProductRow | null>;
  createProduct(input: Partial<ProductRow>, actorId: string): Promise<ProductRow>;
  updateProduct(id: string, patch: Partial<ProductRow>): Promise<ProductRow>;
  adjustStock(productId: string, delta: number, reason: "restock" | "adjustment", actorId: string): Promise<number>;
}

/** Translates Postgres/PostgREST errors into safe API errors. Never leaks DB internals. */
function fail(error: PostgrestError): never {
  switch (error.code) {
    case "23505": throw conflict("A record with this unique value already exists");
    case "23503": throw badRequest("Referenced record does not exist or is still in use");
    case "23514": throw badRequest("A value violates a data constraint");
    case "P0001":
      if (error.message === "INSUFFICIENT_STOCK") throw new AppError(409, "INSUFFICIENT_STOCK", "Insufficient stock");
      throw badRequest("Invalid request");
    case "P0002": throw notFoundError("Product not found");
    default: throw error; // unexpected: becomes a logged 500 with a generic message
  }
}

const PRODUCT_COLUMNS =
  "id, category_id, sku, name, description, brand, unit_label, price_paise, mrp_paise, stock_quantity, image_path, is_active";
const CATEGORY_COLUMNS = "id, parent_id, slug, name, image_path, sort_order, is_active";

export const supabaseCatalogRepository: CatalogRepository = {
  async listCategories(includeInactive) {
    let q = supabaseAdmin.from("categories").select(CATEGORY_COLUMNS).order("sort_order").order("name");
    if (!includeInactive) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) fail(error);
    return data as Category[];
  },

  async createCategory(input) {
    const { data, error } = await supabaseAdmin.from("categories").insert(input).select(CATEGORY_COLUMNS).single();
    if (error) fail(error);
    return data as Category;
  },

  async updateCategory(id, patch) {
    const { data, error } = await supabaseAdmin
      .from("categories").update(patch).eq("id", id).select(CATEGORY_COLUMNS).maybeSingle();
    if (error) fail(error);
    if (!data) throw notFoundError("Category not found");
    return data as Category;
  },

  async listProducts(f) {
    let categoryIds: string[] | undefined;
    if (f.categorySlug) {
      const { data, error } = await supabaseAdmin
        .from("categories").select("id, slug, parent_id").eq("is_active", true);
      if (error) fail(error);
      const root = data.find((c) => c.slug === f.categorySlug);
      if (!root) return { items: [], total: 0 };
      // The category itself plus its direct children.
      categoryIds = [root.id, ...data.filter((c) => c.parent_id === root.id).map((c) => c.id)];
    }

    let q = supabaseAdmin.from("products").select(PRODUCT_COLUMNS, { count: "exact" });
    if (!f.includeInactive) q = q.eq("is_active", true);
    if (categoryIds) q = q.in("category_id", categoryIds);
    if (f.q) q = q.or(`name.ilike.%${f.q}%,brand.ilike.%${f.q}%`);
    const from = (f.page - 1) * f.pageSize;
    const { data, error, count } = await q.order("name").order("id").range(from, from + f.pageSize - 1);
    if (error) fail(error);
    return { items: data as ProductRow[], total: count ?? 0 };
  },

  async getProduct(id, includeInactive) {
    let q = supabaseAdmin.from("products").select(PRODUCT_COLUMNS).eq("id", id);
    if (!includeInactive) q = q.eq("is_active", true);
    const { data, error } = await q.maybeSingle();
    if (error) fail(error);
    return (data as ProductRow | null) ?? null;
  },

  async createProduct(input, actorId) {
    const { stock_quantity, ...rest } = input;
    const { data, error } = await supabaseAdmin
      .from("products").insert({ ...rest, stock_quantity: 0 }).select(PRODUCT_COLUMNS).single();
    if (error) fail(error);
    const product = data as ProductRow;
    if (stock_quantity && stock_quantity > 0) {
      // Opening stock goes through the ledger like every other stock change.
      await this.adjustStock(product.id, stock_quantity, "restock", actorId);
      product.stock_quantity = stock_quantity;
    }
    return product;
  },

  async updateProduct(id, patch) {
    const { data, error } = await supabaseAdmin
      .from("products").update(patch).eq("id", id).select(PRODUCT_COLUMNS).maybeSingle();
    if (error) fail(error);
    if (!data) throw notFoundError("Product not found");
    return data as ProductRow;
  },

  async adjustStock(productId, delta, reason, actorId) {
    const { data, error } = await supabaseAdmin.rpc("adjust_stock", {
      p_product_id: productId, p_delta: delta, p_reason: reason, p_actor: actorId,
    });
    if (error) fail(error);
    return data as number;
  },
};

