import { z } from "zod";
import { ORDER_STATUSES } from "../types/orders.js";

export const checkoutBody = z.strictObject({
  address_id: z.uuid(),
  coupon_code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/).optional(),
});

export const idempotencyKey = z
  .string({ error: "Idempotency-Key header is required" })
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "Idempotency-Key contains unsupported characters");

export const listOrdersQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const adminListOrdersQuery = listOrdersQuery.extend({
  status: z.enum(ORDER_STATUSES).optional(),
});

export const changeStatusBody = z.strictObject({
  status: z.enum(ORDER_STATUSES).exclude(["pending"]),
});
