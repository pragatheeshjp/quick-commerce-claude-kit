import { ApiError } from "@/lib/api";
import { formatPaise } from "@/lib/money";

/** Customer-facing copy for API failures. Never shows raw server text for unexpected errors. */
export function describeApiError(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  const details = err.details as { available_quantity?: number; info?: string } | undefined;

  switch (err.code) {
    case "NETWORK_ERROR":
      return err.message;
    case "UNAUTHORIZED":
      return "Please log in again to continue.";
    case "INSUFFICIENT_STOCK":
      if (typeof details?.available_quantity === "number") {
        return details.available_quantity === 0 ? "This item just went out of stock." : `Only ${details.available_quantity} left in stock.`;
      }
      return "An item in your cart no longer has enough stock. Please review your cart.";
    case "PRODUCT_UNAVAILABLE":
      return "An item in your cart is no longer available. Please review your cart.";
    case "BELOW_MINIMUM_ORDER": {
      const min = Number(details?.info);
      return Number.isInteger(min) ? `The minimum order for your area is ${formatPaise(min)}. Add more items to continue.` : "Your order is below the minimum order value for your area.";
    }
    case "COUPON_MIN_ORDER_NOT_MET": {
      const min = Number(details?.info);
      return Number.isInteger(min) ? `This coupon needs a minimum order of ${formatPaise(min)}.` : "Your order does not meet this coupon's minimum value.";
    }
    case "PINCODE_NOT_SERVICEABLE":
      return "We do not deliver to this address yet. Choose another address.";
    case "CART_EMPTY":
      return "Your cart is empty.";
    case "ADDRESS_NOT_FOUND":
      return "That address is no longer available. Choose another.";
    case "COUPON_INVALID":
      return "This coupon is not valid.";
    case "COUPON_EXHAUSTED":
      return "This coupon is no longer available.";
    case "COUPON_ALREADY_USED":
      return "You have already used this coupon.";
    case "INVALID_TRANSITION":
      return "This order can no longer be changed.";
    case "VALIDATION_ERROR":
      return "Please check the details you entered.";
    default:
      return err.status >= 500 ? "Something went wrong on our side. Please try again." : err.message || "Something went wrong.";
  }
}

export const isCouponError = (err: unknown) => err instanceof ApiError && err.code.startsWith("COUPON_");
