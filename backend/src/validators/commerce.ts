import { z } from "zod";

export const pincode = z.string().regex(/^[1-9][0-9]{5}$/, "must be a 6-digit pincode");

const text = (max: number) => z.string().trim().min(1).max(max);

export const pincodeParams = z.strictObject({ pincode });

export const createAddressBody = z.strictObject({
  label: text(30).default("Home"),
  line1: text(200),
  line2: z.string().trim().max(200).nullable().optional().transform((v) => v || null),
  landmark: z.string().trim().max(100).nullable().optional().transform((v) => v || null),
  city: text(80),
  state: text(80),
  pincode,
  is_default: z.boolean().optional(),
});

export const updateAddressBody = z
  .strictObject({
    label: text(30),
    line1: text(200),
    line2: z.string().trim().max(200).nullable(),
    landmark: z.string().trim().max(100).nullable(),
    city: text(80),
    state: text(80),
    pincode,
    is_default: z.literal(true), // clearing the default is done by choosing another address
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "empty update");

export const cartItemParams = z.strictObject({ productId: z.uuid() });

export const setQuantityBody = z.strictObject({ quantity: z.number().int().min(1).max(50) });
