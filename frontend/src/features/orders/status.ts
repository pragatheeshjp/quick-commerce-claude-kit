import type { OrderStatus } from "@/types/api";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Order placed",
  confirmed: "Confirmed",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Happy-path progression shown as a timeline. */
export const TIMELINE: OrderStatus[] = ["pending", "confirmed", "packed", "out_for_delivery", "delivered"];

/** Customers may cancel only before packing (mirrors the API; the API is the authority). */
export const canCustomerCancel = (s: OrderStatus) => s === "pending" || s === "confirmed";

export function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export const shortOrderId = (id: string) => id.slice(0, 8).toUpperCase();
