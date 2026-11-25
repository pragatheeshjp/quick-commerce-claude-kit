import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { AdminOrder, AdminUser, Me } from "@/types/api";

const call = vi.fn();
const reload = vi.fn();
const dataByPath: Record<string, unknown> = {};
vi.mock("@/features/auth/use-api", () => ({
  useAuthedApi: () => call,
  useApiData: (path: string) => ({ data: dataByPath[path], error: undefined, loading: false, reload, meta: undefined }),
}));
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => ({ user: { id: "me-id" } }) }));
vi.mock("@/features/auth/require-auth", () => ({ RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin" }));

import { AdminAdmins } from "@/features/admin/admin-admins";
import { AdminOrderDetail } from "@/features/admin/admin-order-detail";
import { RequireAdmin } from "@/features/admin/admin-shell";

const order = (status: AdminOrder["status"]): AdminOrder => ({
  id: "abcdef12-0000-4000-8000-000000000000", user_id: "customer-1", status, created_at: "2026-11-22T10:00:00Z",
  subtotal_paise: 18000, discount_paise: 0, delivery_fee_paise: 2500, total_paise: 20500,
  delivery_address: { label: "Home", line1: "12 MG Road", line2: null, landmark: null, city: "Bengaluru", state: "KA", pincode: "560001" },
  items: [{ product_id: "p1", sku: "S1", name: "Milk", quantity: 3, unit_price_paise: 6000, line_total_paise: 18000 }],
});

beforeEach(() => {
  call.mockReset();
  reload.mockReset();
  for (const k of Object.keys(dataByPath)) delete dataByPath[k];
});

describe("RequireAdmin", () => {
  it("shows children to admins", () => {
    dataByPath["/me"] = { id: "x", role: "admin" } satisfies Partial<Me>;
    render(<RequireAdmin><p>secret admin content</p></RequireAdmin>);
    expect(screen.getByText("secret admin content")).toBeInTheDocument();
  });
  it("shows customers a no-access message and never renders the content", () => {
    dataByPath["/me"] = { id: "x", role: "customer" } satisfies Partial<Me>;
    render(<RequireAdmin><p>secret admin content</p></RequireAdmin>);
    expect(screen.getByRole("alert")).toHaveTextContent("No access");
    expect(screen.queryByText("secret admin content")).not.toBeInTheDocument();
  });
});

describe("AdminOrderDetail", () => {
  const path = "/admin/orders/o1";

  it("offers only the legal next steps for each status", () => {
    const expected: Record<string, string[]> = {
      pending: ["Mark as confirmed", "Cancel order"],
      confirmed: ["Mark as packed", "Cancel order"],
      packed: ["Mark as out for delivery"],
      out_for_delivery: ["Mark as delivered"],
      delivered: [],
      cancelled: [],
    };
    for (const [status, labels] of Object.entries(expected)) {
      dataByPath[path] = order(status as AdminOrder["status"]);
      const { unmount } = render(<AdminOrderDetail id="o1" />);
      const buttons = screen.queryAllByRole("button").map((b) => b.textContent);
      expect(buttons, status).toEqual(labels);
      unmount();
    }
  });

  it("advances the status via PATCH and reloads", async () => {
    dataByPath[path] = order("pending");
    call.mockResolvedValue({ data: {} });
    render(<AdminOrderDetail id="o1" />);
    await userEvent.click(screen.getByRole("button", { name: "Mark as confirmed" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(call).toHaveBeenCalledWith("/admin/orders/o1/status", { method: "PATCH", body: { status: "confirmed" } });
  });

  it("requires confirmation before cancelling", async () => {
    dataByPath[path] = order("confirmed");
    call.mockResolvedValue({ data: {} });
    render(<AdminOrderDetail id="o1" />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    expect(call).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Keep order" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, cancel order" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("/admin/orders/o1/status", { method: "PATCH", body: { status: "cancelled" } }));
  });

  it("shows the refusal and refreshes when the status changed underneath", async () => {
    dataByPath[path] = order("pending");
    call.mockRejectedValue(new ApiError(409, "INVALID_TRANSITION", "x"));
    render(<AdminOrderDetail id="o1" />);
    await userEvent.click(screen.getByRole("button", { name: "Mark as confirmed" }));
    expect(await screen.findByText("This order can no longer be changed.")).toBeInTheDocument();
    expect(reload).toHaveBeenCalled();
  });

  it("shows the customer's items, totals and address", () => {
    dataByPath[path] = order("pending");
    render(<AdminOrderDetail id="o1" />);
    expect(screen.getByText(/Milk/)).toBeInTheDocument();
    expect(screen.getByText("₹205")).toBeInTheDocument();
    expect(screen.getByText(/12 MG Road/)).toBeInTheDocument();
  });
});

describe("AdminAdmins", () => {
  const admins: AdminUser[] = [
    { user_id: "me-id", email: "me@example.com", created_at: "2026-11-22T00:00:00Z" },
    { user_id: "other-id", email: "other@example.com", created_at: "2026-11-22T00:00:00Z" },
  ];
  beforeEach(() => { dataByPath["/admin/admins"] = admins; });

  it("does not offer to remove yourself", () => {
    render(<AdminAdmins />);
    expect(screen.getByText("You cannot remove yourself")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Remove other@example.com/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Remove me@example.com/ })).not.toBeInTheDocument();
  });

  it("confirms before removing, then DELETEs that user", async () => {
    call.mockResolvedValue({ data: undefined });
    render(<AdminAdmins />);
    await userEvent.click(screen.getByRole("button", { name: /Remove other@example.com/ }));
    expect(call).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    await waitFor(() => expect(call).toHaveBeenCalledWith("/admin/admins/other-id", { method: "DELETE" }));
    expect(reload).toHaveBeenCalled();
  });

  it("grants by email and reports success", async () => {
    call.mockResolvedValue({ data: {} });
    render(<AdminAdmins />);
    await userEvent.type(screen.getByLabelText("Their email"), "new@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Make admin" }));
    expect(await screen.findByText("new@example.com is now an admin.")).toBeInTheDocument();
    expect(call).toHaveBeenCalledWith("/admin/admins", { method: "POST", body: { email: "new@example.com" } });
  });

  it("validates the email locally and shows the API's message for unknown accounts", async () => {
    render(<AdminAdmins />);
    await userEvent.type(screen.getByLabelText("Their email"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Make admin" }));
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();

    call.mockRejectedValue(new ApiError(404, "USER_NOT_FOUND", "No account exists for that email. Ask them to sign up first."));
    await userEvent.clear(screen.getByLabelText("Their email"));
    await userEvent.type(screen.getByLabelText("Their email"), "ghost@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Make admin" }));
    expect(await screen.findByText(/No account exists for that email/)).toBeInTheDocument();
  });

  it("surfaces last-admin protection", async () => {
    call.mockRejectedValue(new ApiError(409, "LAST_ADMIN", "At least one admin must remain"));
    render(<AdminAdmins />);
    await userEvent.click(screen.getByRole("button", { name: /Remove other@example.com/ }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, remove" }));
    expect(await screen.findByText("At least one admin must remain")).toBeInTheDocument();
  });
});
