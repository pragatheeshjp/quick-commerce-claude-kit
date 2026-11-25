import { api, ApiError } from "@/lib/api";
import type { Category, PageMeta, Product } from "@/types/api";

/** Server-side catalog reads (public endpoints, no token). Call inside <Suspense>. */
export async function getCategories(): Promise<Category[]> {
  return (await api<Category[]>("/categories")).data;
}

export interface ProductQuery {
  category?: string;
  q?: string;
  page?: number;
}

export async function getProducts(query: ProductQuery): Promise<{ items: Product[]; meta: PageMeta }> {
  const params = new URLSearchParams();
  if (query.category) params.set("category", query.category);
  if (query.q) params.set("q", query.q);
  params.set("page", String(query.page ?? 1));
  params.set("pageSize", "24");
  const res = await api<Product[]>(`/products?${params}`);
  return { items: res.data, meta: res.meta as PageMeta };
}

/** Returns null when the product does not exist (so the page can render a 404). */
export async function getProduct(id: string): Promise<Product | null> {
  try {
    return (await api<Product>(`/products/${encodeURIComponent(id)}`)).data;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
    throw err;
  }
}

/** Parses ?page= safely: positive integer, default 1. */
export function parsePage(value: string | string[] | undefined): number {
  const n = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/** Search text the API accepts (letters, digits, space, ' & . -); anything else is stripped. */
export function cleanSearch(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").replace(/[^\p{L}\p{M}\p{N} '&.-]/gu, "").trim().slice(0, 60);
}

/** Runs a loader and returns null on failure, so pages can render an inline error (no JSX inside try/catch). */
export async function attempt<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}
