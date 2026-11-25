import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { Address, Cart } from "@/types/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const call = vi.fn();
let addresses: Address[] = [];
vi.mock("@/features/auth/use-api", () => ({
  useAuthedApi: () => call,
  useApiData: () => ({ data: addresses, error: undefined, loading: false, reload: vi.fn(), meta: undefined }),
}));

const refresh = vi.fn(async () => undefined);
let cart: Cart | null = null;
vi.mock("@/features/cart/cart-provider", () => ({ useCart: () => ({ cart, refresh }) }));

import { CheckoutView } from "@/features/checkout/checkout-view";

const addr = (o: Partial<Address> = {}): Address => ({
  id: "a1", label: "Home", line1: "12 MG Road", line2: null, landmark: null, city: "Bengaluru", state: "KA", pincode: "560001", is_default: true, ...o,
});
const item = { product_id: "p1", name: "Milk", unit_label: "1 L", image_url: null, quantity: 3, unit_price_paise: 6000, mrp_paise: 6000, line_total_paise: 18000, purchasable: true, issue: null } as const;
const quote = { subtotal_paise: 18000, discount_paise: 0, delivery_fee_paise: 2500, total_paise: 20500 };

function route(handlers: { quote?: (body: Record<string, unknown>) => unknown; order?: () => unknown }) {
  call.mockImplementation(async (path: string, opts: { body?: Record<string, unknown> }) => {
    if (path === "/checkout/quote") return { data: await (handlers.quote ?? (() => quote))(opts.body ?? {}) };
    if (path === "/orders") return { data: await (handlers.order ?? (() => ({ id: "order-1" })))() };
    throw new Error(`unexpected ${path}`);
  });
}

beforeEach(() => {
  call.mockReset();
  push.mockReset();
  refresh.mockClear();
  addresses = [addr()];
  cart = { items: [{ ...item }], item_count: 3, subtotal_paise: 18000 };
});

const ordersCalls = () => call.mock.calls.filter(([p]) => p === "/orders") as [string, { headers: Record<string, string>; body: Record<string, unknown> }][];

describe("CheckoutView", () => {
  it("shows the server's quote and places the order with an Idempotency-Key, then opens the order", async () => {
    route({});
    render(<CheckoutView />);
    expect(await screen.findByText("₹205")).toBeInTheDocument(); // total (2500 delivery + 18000)
    expect(screen.getByText("₹25")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /place order · ₹205/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/orders/order-1"));
    const [, opts] = ordersCalls()[0]!;
    expect(opts.headers["Idempotency-Key"]).toBeTruthy();
    expect(opts.body).toEqual({ address_id: "a1" }); // no prices, totals or user ids are ever sent
    expect(refresh).toHaveBeenCalled();
  });

  it("reuses the same Idempotency-Key when retrying after a network failure", async () => {
    let first = true;
    route({ order: () => { if (first) { first = false; throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server."); } return { id: "order-1" }; } });
    render(<CheckoutView />);
    const btn = await screen.findByRole("button", { name: /place order · ₹205/i });
    await userEvent.click(btn);
    expect(await screen.findByText("Cannot reach the server.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /place order · ₹205/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/orders/order-1"));
    const calls = ordersCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1]![1].headers["Idempotency-Key"]).toBe(calls[0]![1].headers["Idempotency-Key"]);
  });

  it("uses a NEW key when the attempt changes (different coupon)", async () => {
    let failOnce = true;
    route({
      quote: (b) => (b.coupon_code ? { ...quote, discount_paise: 500, total_paise: 20000 } : quote),
      order: () => { if (failOnce) { failOnce = false; throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server."); } return { id: "o2" }; },
    });
    render(<CheckoutView />);
    await userEvent.click(await screen.findByRole("button", { name: /place order · ₹205/i }));
    await screen.findByText("Cannot reach the server.");
    await userEvent.type(screen.getByLabelText("Coupon code"), "save5");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    await userEvent.click(await screen.findByRole("button", { name: /place order · ₹200/i }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const calls = ordersCalls();
    expect(calls[1]![1].headers["Idempotency-Key"]).not.toBe(calls[0]![1].headers["Idempotency-Key"]);
    expect(calls[1]![1].body).toEqual({ address_id: "a1", coupon_code: "SAVE5" });
  });

  it("shows a bad coupon's error but keeps the quote without it, and does not send the coupon", async () => {
    route({ quote: (b) => { if (b.coupon_code) throw new ApiError(422, "COUPON_INVALID", "x"); return quote; } });
    render(<CheckoutView />);
    await screen.findByRole("button", { name: /place order · ₹205/i });
    await userEvent.type(screen.getByLabelText("Coupon code"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText("This coupon is not valid.")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: /place order · ₹205/i }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(ordersCalls()[0]![1].body).toEqual({ address_id: "a1" });
  });

  it("validates the coupon format locally without calling the API", async () => {
    route({});
    render(<CheckoutView />);
    await screen.findByRole("button", { name: /place order/i });
    const quotesBefore = call.mock.calls.length;
    await userEvent.type(screen.getByLabelText("Coupon code"), "bad code!");
    await userEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(await screen.findByText(/letters, numbers/i)).toBeInTheDocument();
    expect(call.mock.calls.length).toBe(quotesBefore);
  });

  it("blocks ordering and explains when the order is below the area minimum", async () => {
    route({ quote: () => { throw new ApiError(422, "BELOW_MINIMUM_ORDER", "x", { info: "9900" }); } });
    render(<CheckoutView />);
    expect(await screen.findByText(/minimum order for your area is ₹99/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Back to cart" })).toHaveAttribute("href", "/cart");
  });

  it("surfaces an out-of-stock failure at placement without navigating", async () => {
    route({ order: () => { throw new ApiError(409, "INSUFFICIENT_STOCK", "x", { info: "p1" }); } });
    render(<CheckoutView />);
    await userEvent.click(await screen.findByRole("button", { name: /place order/i }));
    expect(await screen.findByText(/no longer has enough stock/i)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("asks for an address when none are saved and does not quote", async () => {
    addresses = [];
    route({});
    render(<CheckoutView />);
    expect(await screen.findByText(/choose or add a delivery address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Place order" })).toBeDisabled();
    expect(call).not.toHaveBeenCalled();
  });

  it("shows an empty state for an empty cart", async () => {
    cart = { items: [], item_count: 0, subtotal_paise: 0 };
    route({});
    render(<CheckoutView />);
    expect(await screen.findByText("Your cart is empty")).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });
});

