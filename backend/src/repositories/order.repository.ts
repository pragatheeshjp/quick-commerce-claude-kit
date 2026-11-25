import type { PostgrestError } from "@supabase/supabase-js";
import { AppError } from "../lib/errors.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { CheckoutResult, OrderRow, OrderStatus } from "../types/orders.js";

export interface CheckoutInput {
  userId: string;
  addressId: string;
  idempotencyKey: string;
  couponCode?: string;
  dryRun: boolean;
}

export interface OrderRepository {
  checkout(input: CheckoutInput): Promise<CheckoutResult>;
  listForUser(userId: string, page: number, pageSize: number): Promise<{ items: OrderRow[]; total: number }>;
  getForUser(userId: string, id: string): Promise<OrderRow | null>;
  cancel(orderId: string, userId: string | null): Promise<void>;
  listAll(status: OrderStatus | undefined, page: number, pageSize: number): Promise<{ items: OrderRow[]; total: number }>;
  getAny(id: string): Promise<OrderRow | null>;
  /** Optimistic transition: succeeds only if the order is still in `from`. Returns false if it moved. */
  transition(id: string, from: OrderStatus, to: OrderStatus): Promise<boolean>;
}

// Stable error codes raised by the checkout()/cancel_order() SQL functions -> API errors.
const SQL_ERRORS: Record<string, [status: number, code: string, message: string]> = {
  ADDRESS_NOT_FOUND: [404, "ADDRESS_NOT_FOUND", "Address not found"],
  ORDER_NOT_FOUND: [404, "NOT_FOUND", "Order not found"],
  PINCODE_NOT_SERVICEABLE: [422, "PINCODE_NOT_SERVICEABLE", "We do not deliver to this address yet"],
  CART_EMPTY: [400, "CART_EMPTY", "Your cart is empty"],
  PRODUCT_UNAVAILABLE: [409, "PRODUCT_UNAVAILABLE", "An item in your cart is no longer available"],
  INSUFFICIENT_STOCK: [409, "INSUFFICIENT_STOCK", "An item in your cart does not have enough stock"],
  BELOW_MINIMUM_ORDER: [422, "BELOW_MINIMUM_ORDER", "Order is below the minimum order value for this area"],
  COUPON_INVALID: [422, "COUPON_INVALID", "This coupon is not valid"],
  COUPON_MIN_ORDER_NOT_MET: [422, "COUPON_MIN_ORDER_NOT_MET", "Order does not meet this coupon's minimum value"],
  COUPON_EXHAUSTED: [422, "COUPON_EXHAUSTED", "This coupon is no longer available"],
  COUPON_ALREADY_USED: [422, "COUPON_ALREADY_USED", "You have already used this coupon"],
  ORDER_TOO_LARGE: [422, "ORDER_TOO_LARGE", "Order value is too large"],
  INVALID_TRANSITION: [409, "INVALID_TRANSITION", "This order can no longer be changed this way"],
};

function fail(error: PostgrestError): never {
  const mapped = SQL_ERRORS[error.message];
  if (mapped) {
    const [status, code, message] = mapped;
    // `details` carries only a product id or a paise threshold set by our own SQL - safe to expose.
    throw new AppError(status, code, message, error.details ? { info: error.details } : undefined);
  }
  throw error; // unexpected -> logged 500 with a generic message
}

const ORDER_COLUMNS =
  "id, user_id, status, delivery_address, subtotal_paise, discount_paise, delivery_fee_paise, total_paise, created_at";
const WITH_ITEMS = `${ORDER_COLUMNS}, order_items(product_id, sku, name, quantity, unit_price_paise)`;

export const supabaseOrderRepository: OrderRepository = {
  async checkout(i) {
    const { data, error } = await supabaseAdmin.rpc("checkout", {
      p_user_id: i.userId,
      p_address_id: i.addressId,
      p_idempotency_key: i.idempotencyKey,
      p_coupon_code: i.couponCode ?? null,
      p_dry_run: i.dryRun,
    });
    if (error) fail(error);
    return data as CheckoutResult;
  },

  async listForUser(userId, page, pageSize) {
    const from = (page - 1) * pageSize;
    const { data, error, count } = await supabaseAdmin
      .from("orders").select(ORDER_COLUMNS, { count: "exact" }).eq("user_id", userId)
      .order("created_at", { ascending: false }).order("id").range(from, from + pageSize - 1);
    if (error) fail(error);
    return { items: data as unknown as OrderRow[], total: count ?? 0 };
  },

  async getForUser(userId, id) {
    const { data, error } = await supabaseAdmin
      .from("orders").select(WITH_ITEMS).eq("id", id).eq("user_id", userId).maybeSingle();
    if (error) fail(error);
    return (data as unknown as OrderRow | null) ?? null;
  },

  async cancel(orderId, userId) {
    const { error } = await supabaseAdmin.rpc("cancel_order", { p_order_id: orderId, p_user_id: userId });
    if (error) fail(error);
  },

  async listAll(status, page, pageSize) {
    const from = (page - 1) * pageSize;
    let q = supabaseAdmin.from("orders").select(ORDER_COLUMNS, { count: "exact" });
    if (status) q = q.eq("status", status);
    const { data, error, count } = await q
      .order("created_at", { ascending: false }).order("id").range(from, from + pageSize - 1);
    if (error) fail(error);
    return { items: data as unknown as OrderRow[], total: count ?? 0 };
  },

  async getAny(id) {
    const { data, error } = await supabaseAdmin.from("orders").select(WITH_ITEMS).eq("id", id).maybeSingle();
    if (error) fail(error);
    return (data as unknown as OrderRow | null) ?? null;
  },

  async transition(id, from, to) {
    const { data, error } = await supabaseAdmin
      .from("orders").update({ status: to }).eq("id", id).eq("status", from).select("id").maybeSingle();
    if (error) fail(error);
    return data !== null;
  },
};

