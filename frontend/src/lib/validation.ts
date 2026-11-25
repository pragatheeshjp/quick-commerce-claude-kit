import { z } from "zod";
import { parseRupeesToPaise } from "@/lib/rupees";

const email = z.string().trim().min(1, "Enter your email").pipe(z.email("Enter a valid email address"));
const password = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your name").max(80, "Name is too long"),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export const forgotSchema = z.object({ email });

export const resetSchema = z
  .object({ password, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const pincodeSchema = z.string().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode");

/** Flattens a ZodError into { field: firstMessage } for inline form errors. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

const optionalText = (max: number) =>
  z.string().trim().max(max, `Use at most ${max} characters`).optional().transform((v) => (v ? v : null));

export const addressSchema = z.object({
  label: z.string().trim().min(1, "Give this address a label").max(30, "Label is too long"),
  line1: z.string().trim().min(1, "Enter the house/flat and street").max(200, "Address is too long"),
  line2: optionalText(200),
  landmark: optionalText(100),
  city: z.string().trim().min(1, "Enter your city").max(80),
  state: z.string().trim().min(1, "Enter your state").max(80),
  pincode: pincodeSchema,
  is_default: z.boolean().optional(),
});

export const couponSchema = z
  .string()
  .trim()
  .min(1, "Enter a coupon code")
  .max(40, "Coupon code is too long")
  .regex(/^[A-Za-z0-9_-]+$/, "Coupon codes use letters, numbers, - and _ only");


const rupees = (label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      const paise = parseRupeesToPaise(v);
      if (paise === null) {
        ctx.addIssue({ code: "custom", message: `Enter a valid ${label}, like 68 or 68.50` });
        return z.NEVER;
      }
      return paise;
    });

/** Admin product form: prices are typed in rupees and converted to integer paise here. */
export const productFormSchema = z
  .object({
    category_id: z.uuid("Choose a category"),
    sku: z.string().trim().min(1, "Enter a SKU").max(40, "SKU is too long").regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, . _ and - only"),
    name: z.string().trim().min(1, "Enter a name").max(150, "Name is too long"),
    brand: optionalText(80),
    unit_label: z.string().trim().min(1, "Enter a pack size, e.g. 500 g").max(30, "Too long"),
    description: optionalText(2000),
    price: rupees("price"),
    mrp: rupees("MRP"),
    is_active: z.boolean(),
    initial_stock: z.string().trim().regex(/^\d{0,7}$/, "Enter a whole number").transform((v) => (v ? Number(v) : 0)),
  })
  .refine((v) => v.mrp >= v.price, { path: ["mrp"], message: "MRP cannot be lower than the price" });

export const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(100, "Name is too long"),
  slug: z.string().trim().min(1, "Enter a slug").max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Lowercase letters, numbers and hyphens, e.g. fresh-fruit"),
  parent_id: z.string().transform((v) => (v ? v : null)).pipe(z.uuid().nullable()),
  sort_order: z.string().trim().regex(/^\d{1,5}$/, "Enter a whole number").transform(Number),
  is_active: z.boolean(),
});

export const stockSchema = z.object({
  delta: z
    .string()
    .trim()
    .regex(/^-?\d{1,7}$/, "Enter a whole number, e.g. 20 or -3")
    .transform(Number)
    .refine((n) => n !== 0, "Change cannot be 0"),
  reason: z.enum(["restock", "adjustment"]),
});

export const grantAdminSchema = z.object({ email });

