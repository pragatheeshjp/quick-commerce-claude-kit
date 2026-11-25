import type { PostgrestError } from "@supabase/supabase-js";
import { notFoundError } from "../lib/errors.js";
import { supabaseAdmin } from "../lib/supabase.js";
import type { CartLineRow } from "../types/commerce.js";

export interface CartRepository {
  getLines(userId: string): Promise<CartLineRow[]>;
  getProductForCart(productId: string): Promise<{ id: string; stock_quantity: number; is_active: boolean } | null>;
  setQuantity(userId: string, productId: string, quantity: number): Promise<void>;
  removeItem(userId: string, productId: string): Promise<void>;
  clear(userId: string): Promise<void>;
}

function fail(error: PostgrestError): never {
  throw error; // unexpected -> logged 500 with a generic message
}

async function cartIdFor(userId: string, create: boolean): Promise<string | null> {
  if (create) {
    const { data, error } = await supabaseAdmin
      .from("carts").upsert({ user_id: userId }, { onConflict: "user_id" }).select("id").single();
    if (error) fail(error);
    return data.id as string;
  }
  const { data, error } = await supabaseAdmin.from("carts").select("id").eq("user_id", userId).maybeSingle();
  if (error) fail(error);
  return (data?.id as string | undefined) ?? null;
}

export const supabaseCartRepository: CartRepository = {
  async getLines(userId) {
    const cartId = await cartIdFor(userId, false);
    if (!cartId) return [];
    const { data, error } = await supabaseAdmin
      .from("cart_items")
      .select("product_id, quantity, created_at, product:products(id, name, unit_label, price_paise, mrp_paise, stock_quantity, image_path, is_active)")
      .eq("cart_id", cartId)
      .order("created_at");
    if (error) fail(error);
    return data as unknown as CartLineRow[];
  },

  async getProductForCart(productId) {
    const { data, error } = await supabaseAdmin
      .from("products").select("id, stock_quantity, is_active").eq("id", productId).maybeSingle();
    if (error) fail(error);
    return data;
  },

  async setQuantity(userId, productId, quantity) {
    const cartId = (await cartIdFor(userId, true))!;
    const { error } = await supabaseAdmin
      .from("cart_items").upsert({ cart_id: cartId, product_id: productId, quantity }, { onConflict: "cart_id,product_id" });
    if (error) fail(error);
  },

  async removeItem(userId, productId) {
    const cartId = await cartIdFor(userId, false);
    if (!cartId) throw notFoundError("Item not in cart");
    const { data, error } = await supabaseAdmin
      .from("cart_items").delete().eq("cart_id", cartId).eq("product_id", productId).select("product_id").maybeSingle();
    if (error) fail(error);
    if (!data) throw notFoundError("Item not in cart");
  },

  async clear(userId) {
    const cartId = await cartIdFor(userId, false);
    if (!cartId) return;
    const { error } = await supabaseAdmin.from("cart_items").delete().eq("cart_id", cartId);
    if (error) fail(error);
  },
};
