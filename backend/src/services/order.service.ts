import { AppError, notFoundError } from "../lib/errors.js";
import type { OrderRepository } from "../repositories/order.repository.js";
import type { OrderRow, OrderStatus } from "../types/orders.js";

/** The only legal order-status moves. Cancellation is separate: it restores stock via cancel_order(). */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

export const canTransition = (from: OrderStatus, to: OrderStatus) => ALLOWED_TRANSITIONS[from].includes(to);

const present = (o: OrderRow, includeUser = false) => ({
  id: o.id,
  ...(includeUser ? { user_id: o.user_id } : {}),
  status: o.status,
  delivery_address: o.delivery_address,
  subtotal_paise: o.subtotal_paise,
  discount_paise: o.discount_paise,
  delivery_fee_paise: o.delivery_fee_paise,
  total_paise: o.total_paise,
  created_at: o.created_at,
  ...(o.order_items
    ? { items: o.order_items.map((i) => ({ ...i, line_total_paise: i.unit_price_paise * i.quantity })) }
    : {}),
});

export function createOrderService(repo: OrderRepository) {
  const pageMeta = (page: number, pageSize: number, total: number) => ({ page, pageSize, total });

  return {
    async quote(userId: string, body: { address_id: string; coupon_code?: string }) {
      const r = await repo.checkout({
        userId, addressId: body.address_id, idempotencyKey: "quote", couponCode: body.coupon_code, dryRun: true,
      });
      return {
        subtotal_paise: r.subtotal_paise,
        discount_paise: r.discount_paise,
        delivery_fee_paise: r.delivery_fee_paise,
        total_paise: r.total_paise,
      };
    },

    async placeOrder(userId: string, key: string, body: { address_id: string; coupon_code?: string }) {
      const r = await repo.checkout({
        userId, addressId: body.address_id, idempotencyKey: key, couponCode: body.coupon_code, dryRun: false,
      });
      const order = await repo.getForUser(userId, r.order_id!);
      if (!order) throw new AppError(500, "INTERNAL", "Order could not be loaded");
      return { replayed: r.replayed, order: present(order) };
    },

    async list(userId: string, page: number, pageSize: number) {
      const { items, total } = await repo.listForUser(userId, page, pageSize);
      return { items: items.map((o) => present(o)), meta: pageMeta(page, pageSize, total) };
    },

    async get(userId: string, id: string) {
      const o = await repo.getForUser(userId, id);
      if (!o) throw notFoundError("Order not found");
      return present(o);
    },

    async cancel(userId: string, id: string) {
      await repo.cancel(id, userId); // ownership enforced inside the SQL function
      return this.get(userId, id);
    },

    admin: {
      async list(status: OrderStatus | undefined, page: number, pageSize: number) {
        const { items, total } = await repo.listAll(status, page, pageSize);
        return { items: items.map((o) => present(o, true)), meta: pageMeta(page, pageSize, total) };
      },

      async get(id: string) {
        const o = await repo.getAny(id);
        if (!o) throw notFoundError("Order not found");
        return present(o, true);
      },

      async changeStatus(id: string, to: OrderStatus) {
        const current = await repo.getAny(id);
        if (!current) throw notFoundError("Order not found");
        if (to === "cancelled") {
          if (!canTransition(current.status, "cancelled") && current.status !== "cancelled") {
            throw new AppError(409, "INVALID_TRANSITION", `Cannot move an order from ${current.status} to ${to}`);
          }
          await repo.cancel(id, null);
        } else {
          if (!canTransition(current.status, to)) {
            throw new AppError(409, "INVALID_TRANSITION", `Cannot move an order from ${current.status} to ${to}`);
          }
          if (!(await repo.transition(id, current.status, to))) {
            throw new AppError(409, "INVALID_TRANSITION", "Order status changed concurrently, please retry");
          }
        }
        return this.get(id);
      },
    },
  };
}
export type OrderService = ReturnType<typeof createOrderService>;

