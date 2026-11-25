import { z } from "zod";

const uuid = z.uuid();
const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "lowercase letters, digits and hyphens").max(80);
const paise = z.number().int().min(0).max(100_000_000);
const imagePath = z.string().max(300).regex(/^[A-Za-z0-9._\-/]+$/).refine((p) => !p.includes(".."), "invalid path");

export const idParams = z.strictObject({ id: uuid });

// Search text is interpolated into a PostgREST filter, so allow only a safe character set.
const searchText = z
  .string()
  .trim()
  .min(1)
  .max(60)
  // \p{M} (combining marks) is required for scripts like Devanagari, where vowel signs are marks, not letters.
  .regex(/^[\p{L}\p{M}\p{N} '&.-]+$/u, "contains unsupported characters");

export const listProductsQuery = z.object({
  category: slug.optional(),
  q: searchText.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const createCategoryBody = z.strictObject({
  parent_id: uuid.nullable().optional(),
  slug,
  name: z.string().trim().min(1).max(100),
  image_path: imagePath.nullable().optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
  is_active: z.boolean().optional(),
});
export const updateCategoryBody = createCategoryBody.partial().refine((v) => Object.keys(v).length > 0, "empty update");

const productFields = {
  category_id: uuid,
  sku: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/),
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2000).nullable().optional(),
  brand: z.string().trim().max(80).nullable().optional(),
  unit_label: z.string().trim().min(1).max(30),
  price_paise: paise,
  mrp_paise: paise,
  image_path: imagePath.nullable().optional(),
  is_active: z.boolean().optional(),
};

export const createProductBody = z
  .strictObject({ ...productFields, initial_stock: z.number().int().min(0).max(1_000_000).optional() })
  .refine((p) => p.mrp_paise >= p.price_paise, { message: "mrp_paise must be >= price_paise", path: ["mrp_paise"] });

// Stock is deliberately not updatable here; it changes only through the stock endpoint.
export const updateProductBody = z
  .strictObject(Object.fromEntries(Object.entries(productFields).map(([k, v]) => [k, v.optional()])) as {
    [K in keyof typeof productFields]: z.ZodOptional<(typeof productFields)[K]>;
  })
  .refine((v) => Object.keys(v).length > 0, "empty update")
  .refine((v) => v.price_paise === undefined || v.mrp_paise === undefined || v.mrp_paise >= v.price_paise, {
    message: "mrp_paise must be >= price_paise",
    path: ["mrp_paise"],
  });

export const adminListProductsQuery = listProductsQuery.extend({
  includeInactive: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
});

export const stockBody = z.strictObject({
  delta: z.number().int().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, "delta must not be 0"),
  reason: z.enum(["restock", "adjustment"]),
});

