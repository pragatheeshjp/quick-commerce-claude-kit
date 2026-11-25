import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { Address, Cart, CartItem } from "@/types/api";

const call = vi.fn();
const reload = vi.fn();
const addressData: { data?: Address[]; error?: string; loading: boolean } = { loading: false };
vi.mock("@/features/auth/use-api", () => ({
  useAuthedApi: () => call,
  useApiData: () => ({ ...addressData, reload, meta: undefined }),
}));

const cartCtx = {
  cart: null as Cart | null,
  refresh: vi.fn(),
  setQuantity: vi.fn(),
  remove: vi.fn(),
  busy: new Set<string>(),
};
vi.mock("@/features/cart/cart-provider", () => ({ useCart: () => cartCtx }));

import { AddressBook, addressLine } from "@/features/addresses/address-book";
import { AddressForm } from "@/features/addresses/address-form";
import { CartView } from "@/features/cart/cart-view";

const addr = (o: Partial<Address> = {}): Address => ({ id: "a1", label: "Home", line1: "12 MG Road", line2: null, landmark: null, city: "Bengaluru", state: "KA", pincode: "560001", is_default: false, ...o });

beforeEach(() => {
  call.mockReset();
  reload.mockReset();
  Object.assign(addressData, { data: [], error: undefined, loading: false });
  Object.assign(cartCtx, { cart: null, busy: new Set<string>() });
  cartCtx.refresh.mockReset();
  cartCtx.setQuantity.mockReset().mockResolvedValue({});
  cartCtx.remove.mockReset().mockResolvedValue({});
});

describe("addressLine", () => {
  it("joins the parts that exist", () => {
    expect(addressLine(addr())).toBe("12 MG Road, Bengaluru, KA 560001");
    expect(addressLine(addr({ line2: "Apt 4", landmark: "Near park" }))).toBe("12 MG Road, Apt 4, Near park, Bengaluru, KA 560001");
  });
});

describe("AddressForm", () => {
  const fill = async (pincode = "560001") => {
    await userEvent.type(screen.getByLabelText("House / flat and street"), "  12 MG Road ");
    await userEvent.type(screen.getByLabelText("City"), "Bengaluru");
    await userEvent.type(screen.getByLabelText("State"), "Karnataka");
    await userEvent.type(screen.getByLabelText("Pincode"), pincode);
  };

  it("shows inline errors for an empty form and sends nothing", async () => {
    render(<AddressForm onSaved={vi.fn()} />);
    await userEvent.clear(screen.getByLabelText(/Label/));
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));
    expect(await screen.findByText("Give this address a label")).toBeInTheDocument();
    expect(screen.getByText("Enter the house/flat and street")).toBeInTheDocument();
    expect(screen.getByText("Enter your city")).toBeInTheDocument();
    expect(screen.getByText("Enter a valid 6-digit pincode")).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it("rejects a pincode starting with 0", async () => {
    render(<AddressForm onSaved={vi.fn()} />);
    await fill("012345");
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));
    expect(await screen.findByText("Enter a valid 6-digit pincode")).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it("posts trimmed values with blank optionals as null and the default flag as a boolean", async () => {
    const onSaved = vi.fn();
    call.mockResolvedValue({ data: addr({ id: "new" }) });
    render(<AddressForm onSaved={onSaved} />);
    await fill();
    await userEvent.click(screen.getByLabelText(/default address/i));
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: "new" })));
    expect(call).toHaveBeenCalledWith("/addresses", {
      method: "POST",
      body: { label: "Home", line1: "12 MG Road", line2: null, landmark: null, city: "Bengaluru", state: "Karnataka", pincode: "560001", is_default: true },
    });
  });

  it("shows the API's friendly error and can be cancelled", async () => {
    call.mockRejectedValue(new ApiError(400, "BAD_REQUEST", "You can save at most 10 addresses"));
    const onCancel = vi.fn();
    render(<AddressForm onSaved={vi.fn()} onCancel={onCancel} />);
    await fill();
    await userEvent.click(screen.getByRole("button", { name: "Save address" }));
    expect(await screen.findByText("You can save at most 10 addresses")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("AddressBook", () => {
  it("handles loading, error and empty states", () => {
    addressData.loading = true;
    const { unmount } = render(<AddressBook />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading addresses/i);
    unmount();
    Object.assign(addressData, { loading: false, error: "Could not load" });
    const second = render(<AddressBook />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load");
    second.unmount();
    Object.assign(addressData, { error: undefined, data: [] });
    render(<AddressBook />);
    expect(screen.getByText("No saved addresses")).toBeInTheDocument();
  });

  it("lists addresses with a default badge, offering 'make default' only on non-default ones", () => {
    addressData.data = [addr({ id: "a1", label: "Home", is_default: true }), addr({ id: "a2", label: "Work" })];
    render(<AddressBook />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /make default home/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /make default work/i })).toBeInTheDocument();
  });

  it("becomes a radio group when selectable, reporting the selection and the loaded list", async () => {
    addressData.data = [addr({ id: "a1", is_default: true }), addr({ id: "a2", label: "Work" })];
    const onSelect = vi.fn();
    const onLoaded = vi.fn();
    render(<AddressBook selectedId="a1" onSelect={onSelect} onLoaded={onLoaded} />);
    expect(onLoaded).toHaveBeenCalledWith(addressData.data);
    expect(screen.getByRole("radiogroup", { name: "Delivery address" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")[0]).toBeChecked();
    await userEvent.click(screen.getAllByRole("radio")[1]!);
    expect(onSelect).toHaveBeenCalledWith("a2");
  });

  it("makes an address default or deletes it via the API, then reloads", async () => {
    addressData.data = [addr({ id: "a1", is_default: true }), addr({ id: "a2", label: "Work" })];
    call.mockResolvedValue({ data: {} });
    render(<AddressBook />);
    await userEvent.click(screen.getByRole("button", { name: /make default work/i }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(call).toHaveBeenLastCalledWith("/addresses/a2", { method: "PATCH", body: { is_default: true } });
    await userEvent.click(screen.getByRole("button", { name: /delete work/i }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
    expect(call).toHaveBeenLastCalledWith("/addresses/a2", { method: "DELETE" });
  });

  it("shows an error and does not reload when an action fails", async () => {
    addressData.data = [addr({ id: "a1" })];
    call.mockRejectedValue(new ApiError(404, "NOT_FOUND", "Address not found"));
    render(<AddressBook />);
    await userEvent.click(screen.getByRole("button", { name: /delete home/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });

  it("opens the add form, then selects and reloads after saving; cancel closes it", async () => {
    addressData.data = [addr({ id: "a1" })];
    call.mockResolvedValue({ data: addr({ id: "brand-new" }) });
    const onSelect = vi.fn();
    render(<AddressBook onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /add a new address/i }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("form", { name: /add a new address/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /add a new address/i }));
    const form = screen.getByRole("form", { name: /add a new address/i });
    await userEvent.type(within(form).getByLabelText("House / flat and street"), "9 Park St");
    await userEvent.type(within(form).getByLabelText("City"), "Kolkata");
    await userEvent.type(within(form).getByLabelText("State"), "WB");
    await userEvent.type(within(form).getByLabelText("Pincode"), "700016");
    await userEvent.click(within(form).getByRole("button", { name: "Save address" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith("brand-new"));
    expect(reload).toHaveBeenCalled();
  });

  it("stops offering to add once the 10-address limit is reached", () => {
    addressData.data = Array.from({ length: 10 }, (_, i) => addr({ id: `a${i}`, label: `L${i}` }));
    render(<AddressBook />);
    expect(screen.queryByRole("button", { name: /add a new address/i })).not.toBeInTheDocument();
  });
});

describe("CartView", () => {
  const item = (o: Partial<CartItem> = {}): CartItem => ({
    product_id: "p1", name: "Toned Milk", unit_label: "1 L", image_url: null, quantity: 2, unit_price_paise: 6800, mrp_paise: 7000,
    line_total_paise: 13600, purchasable: true, issue: null, ...o,
  });
  const cartOf = (items: CartItem[]): Cart => ({
    items, item_count: items.reduce((n, i) => n + i.quantity, 0),
    subtotal_paise: items.filter((i) => i.purchasable).reduce((s, i) => s + i.line_total_paise, 0),
  });

  it("refreshes prices and stock whenever the page opens", () => {
    cartCtx.cart = cartOf([item()]);
    render(<CartView />);
    expect(cartCtx.refresh).toHaveBeenCalled();
  });

  it("shows a loading state until the cart arrives", () => {
    render(<CartView />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading your cart/i);
  });

  it("shows an empty cart with a way back to shopping", () => {
    cartCtx.cart = cartOf([]);
    render(<CartView />);
    expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start shopping" })).toHaveAttribute("href", "/");
  });

  it("lists lines with server prices and offers checkout when everything is purchasable", () => {
    cartCtx.cart = cartOf([item(), item({ product_id: "p2", name: "Eggs", quantity: 1, unit_price_paise: 9500, line_total_paise: 9500 })]);
    render(<CartView />);
    expect(screen.getByRole("link", { name: "Toned Milk" })).toHaveAttribute("href", "/product/p1");
    expect(screen.getByText("₹136")).toBeInTheDocument();
    expect(screen.getByText("₹95")).toBeInTheDocument();
    expect(screen.getByText("₹231")).toBeInTheDocument(); // subtotal 13600 + 9500
    expect(screen.getByRole("link", { name: "Proceed to checkout" })).toHaveAttribute("href", "/checkout");
  });

  it("blocks checkout and explains unavailable and low-stock lines", () => {
    cartCtx.cart = cartOf([item({ issue: "unavailable", purchasable: false }), item({ product_id: "p2", name: "Eggs", issue: "insufficient_stock", purchasable: false, available_quantity: 1 })]);
    render(<CartView />);
    expect(screen.getByText(/no longer available/i)).toBeInTheDocument();
    expect(screen.getByText(/only 1 left/i)).toBeInTheDocument();
    expect(screen.getByText(/fix the highlighted items/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Proceed to checkout" })).not.toBeInTheDocument();
    expect(screen.getByText("Proceed to checkout")).toHaveAttribute("aria-disabled", "true");
  });

  it("steps the quantity by one and removes lines through the cart context", async () => {
    cartCtx.cart = cartOf([item({ quantity: 2 })]);
    render(<CartView />);
    await userEvent.click(screen.getByRole("button", { name: "Increase quantity of Toned Milk" }));
    expect(cartCtx.setQuantity).toHaveBeenLastCalledWith("p1", 3);
    await userEvent.click(screen.getByRole("button", { name: "Decrease quantity of Toned Milk" }));
    expect(cartCtx.setQuantity).toHaveBeenLastCalledWith("p1", 1);
    await userEvent.click(screen.getByRole("button", { name: /remove toned milk/i }));
    expect(cartCtx.remove).toHaveBeenCalledWith("p1");
  });

  it("limits the stepper: no decrease below 1 (use Remove) and no increase above 50", () => {
    cartCtx.cart = cartOf([item({ quantity: 1 })]);
    const { unmount } = render(<CartView />);
    expect(screen.getByRole("button", { name: "Decrease quantity of Toned Milk" })).toBeDisabled();
    unmount();
    cartCtx.cart = cartOf([item({ quantity: 50 })]);
    render(<CartView />);
    expect(screen.getByRole("button", { name: "Increase quantity of Toned Milk" })).toBeDisabled();
  });

  it("shows the API's message when a change is refused, and disables controls while busy", async () => {
    cartCtx.cart = cartOf([item()]);
    cartCtx.setQuantity.mockResolvedValue({ error: "Only 2 left in stock." });
    const { unmount } = render(<CartView />);
    await userEvent.click(screen.getByRole("button", { name: "Increase quantity of Toned Milk" }));
    expect(await screen.findByText("Only 2 left in stock.")).toBeInTheDocument();
    unmount();
    cartCtx.busy = new Set(["p1"]);
    render(<CartView />);
    expect(screen.getByRole("button", { name: "Increase quantity of Toned Milk" })).toBeDisabled();
  });
});
