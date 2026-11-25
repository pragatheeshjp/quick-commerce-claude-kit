import { AppError, badRequest, notFoundError } from "../lib/errors.js";
import type { AddressRepository } from "../repositories/address.repository.js";
import type { CartRepository } from "../repositories/cart.repository.js";
import type { AddressInput } from "../types/commerce.js";

export const MAX_ADDRESSES = 10;

export function createAddressService(repo: AddressRepository) {
  return {
    list: (userId: string) => repo.list(userId),

    async create(userId: string, input: AddressInput) {
      const existing = await repo.count(userId);
      if (existing >= MAX_ADDRESSES) {
        throw badRequest(`You can save at most ${MAX_ADDRESSES} addresses`);
      }
      // The very first address becomes the default automatically.
      return repo.create(userId, { ...input, is_default: input.is_default || existing === 0 });
    },

    update: (userId: string, id: string, patch: Partial<AddressInput>) => repo.update(userId, id, patch),
    remove: (userId: string, id: string) => repo.remove(userId, id),

    async serviceability(pincode: string) {
      const p = await repo.findPincode(pincode);
      if (!p) return { pincode, serviceable: false as const };
      return {
        pincode,
        serviceable: true as const,
        area_name: p.area_name,
        city: p.city,
        delivery_fee_paise: p.delivery_fee_paise,
        min_order_paise: p.min_order_paise,
      };
    },
  };
}
export type AddressService = ReturnType<typeof createAddressService>;

export function createCartService(repo: CartRepository, storageBaseUrl: string) {
  // Prices always come from the products table right now - the client never supplies a price.
  // Totals here are informational; checkout recalculates and re-validates everything.
  async function view(userId: string) {
    const lines = await repo.getLines(userId);
    const items = lines.map((l) => {
      const p = l.product;
      const purchasable = p.is_active && p.stock_quantity >= l.quantity;
      return {
        product_id: l.product_id,
        name: p.name,
        unit_label: p.unit_label,
        image_url: p.image_path ? `${storageBaseUrl}/product-images/${p.image_path}` : null,
        quantity: l.quantity,
        unit_price_paise: p.price_paise,
        mrp_paise: p.mrp_paise,
        line_total_paise: p.price_paise * l.quantity,
        purchasable,
        issue: !p.is_active ? "unavailable" : p.stock_quantity < l.quantity ? "insufficient_stock" : null,
        ...(p.is_active && p.stock_quantity < l.quantity ? { available_quantity: p.stock_quantity } : {}),
      };
    });
    return {
      items,
      item_count: items.reduce((n, i) => n + i.quantity, 0),
      subtotal_paise: items.filter((i) => i.purchasable).reduce((s, i) => s + i.line_total_paise, 0),
    };
  }

  return {
    view,

    async setQuantity(userId: string, productId: string, quantity: number) {
      const product = await repo.getProductForCart(productId);
      if (!product || !product.is_active) throw notFoundError("Product not found");
      if (quantity > product.stock_quantity) {
        throw new AppError(409, "INSUFFICIENT_STOCK", `Only ${product.stock_quantity} available`, {
          available_quantity: product.stock_quantity,
        });
      }
      await repo.setQuantity(userId, productId, quantity);
      return view(userId);
    },

    async removeItem(userId: string, productId: string) {
      await repo.removeItem(userId, productId);
      return view(userId);
    },

    async clear(userId: string) {
      await repo.clear(userId);
      return view(userId);
    },
  };
}
export type CartService = ReturnType<typeof createCartService>;

