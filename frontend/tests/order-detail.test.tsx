import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { Order } from "@/types/api";

const call = vi.fn();
const reload = vi.fn();
let state: { data?: Order; error?: string; loading: boolean } = { loading: false };
vi.mock("@/features/auth/use-api", () => ({
  useAuthedApi: () => call,
  useApiData: () => ({ ...state, reload, meta: undefined }),
}));

import { OrderDetail } from "@/features/orders/order-detail";

const order = (o: Partial<Order> = {}): Order => ({
  id: "abcdef12-0000-4000-8000-000000000000", status: "pending", created_at: "2026-11-22T10:00:00Z",
  subtotal_paise: 18000, discount_paise: 500, delivery_fee_paise: 2500, total_paise: 20000,
  delivery_address: { label: "Home", line1: "12 MG Road", line2: null, landmark: null, city: "Bengaluru", state: "KA", pincode: "560001" },
  items: [{ product_id: "p1", sku: "S1", name: "Milk", quantity: 3, unit_price_paise: 6000, line_total_paise: 18000 }], ...o,
});

beforeEach(() => {
  call.mockReset();
  reload.mockReset();
  state = { data: order(), loading: false };
});

describe("OrderDetail", () => {
  it("shows items, server totals, address and the placed-order notice", () => {
    render(<OrderDetail id="o1" />);
    expect(screen.getByText("Order #ABCDEF12")).toBeInTheDocument();
    expect(screen.getByText(/Milk/)).toBeInTheDocument();
    expect(screen.getAllByText("₹180")).toHaveLength(2); // line total and items subtotal
    expect(screen.getByText("-₹5")).toBeInTheDocument();
    expect(screen.getByText("₹200")).toBeInTheDocument(); // total
    expect(screen.getByText(/12 MG Road/)).toBeInTheDocument();
    expect(screen.getByText(/will confirm it shortly/i)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Order progress" })).toBeInTheDocument();
  });

  it("offers cancellation only before packing", () => {
    for (const s of ["pending", "confirmed"] as const) {
      state = { data: order({ status: s }), loading: false };
      const { unmount } = render(<OrderDetail id="o1" />);
      expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
      unmount();
    }
    for (const s of ["packed", "out_for_delivery", "delivered", "cancelled"] as const) {
      state = { data: order({ status: s }), loading: false };
      const { unmount } = render(<OrderDetail id="o1" />);
      expect(screen.queryByRole("button", { name: "Cancel order" })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("requires confirmation, then cancels via the API and reloads", async () => {
    call.mockResolvedValue({ data: order({ status: "cancelled" }) });
    render(<OrderDetail id="o1" />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    expect(call).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Keep order" }));
    expect(screen.getByRole("button", { name: "Cancel order" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, cancel order" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(call).toHaveBeenCalledWith("/orders/o1/cancel", { method: "POST" });
  });

  it("shows the reason and refreshes when cancelling is no longer allowed", async () => {
    call.mockRejectedValue(new ApiError(409, "INVALID_TRANSITION", "x"));
    render(<OrderDetail id="o1" />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, cancel order" }));
    expect(await screen.findByText("This order can no longer be changed.")).toBeInTheDocument();
    expect(reload).toHaveBeenCalled();
  });

  it("shows a cancelled banner instead of a timeline", () => {
    state = { data: order({ status: "cancelled" }), loading: false };
    render(<OrderDetail id="o1" />);
    expect(screen.getByText("This order was cancelled.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Order progress" })).not.toBeInTheDocument();
  });

  it("handles loading and error states", () => {
    state = { loading: true };
    const { unmount } = render(<OrderDetail id="o1" />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    unmount();
    state = { error: "Order not found", loading: false };
    render(<OrderDetail id="o1" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Order not found");
    expect(screen.getByRole("link", { name: "Back to your orders" })).toHaveAttribute("href", "/orders");
  });
});

