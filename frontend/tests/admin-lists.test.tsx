import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { AdminCategory, AdminOrder, AdminProduct } from "@/types/api";

const call = vi.fn();
const reload = vi.fn();
const paths: string[] = [];
type Resp = { data?: unknown; meta?: { page: number; pageSize: number; total: number }; error?: string; loading?: boolean };
let respond: (path: string) => Resp = () => ({});
vi.mock("@/features/auth/use-api", () => ({
  useAuthedApi: () => call,
  useApiData: (path: string) => {
    paths.push(path);
    return { loading: false, ...respond(path), reload };
  },
}));

import { AdminCategories } from "@/features/admin/admin-categories";
import { AdminOrdersBoard } from "@/features/admin/admin-orders-board";
import { AdminOverview } from "@/features/admin/admin-overview";
import { AdminProductsList } from "@/features/admin/admin-products-list";

const lastPath = () => paths[paths.length - 1];
const UID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  call.mockReset();
  reload.mockReset();
  paths.length = 0;
  respond = () => ({});
});

const prod = (o: Partial<AdminProduct> = {}): AdminProduct => ({
  id: "p1", category_id: UID, sku: "MLK-1", name: "Toned Milk", description: null, brand: null, unit_label: "1 L",
  price_paise: 6800, mrp_paise: 7000, stock_quantity: 12, image_url: null, is_active: true, ...o,
});

describe("AdminProductsList", () => {
  it("requests the first page of 20 by default", () => {
    render(<AdminProductsList />);
    expect(lastPath()).toBe("/admin/products?page=1&pageSize=20");
  });

  it("shows product rows with price, stock, status and an edit link", () => {
    respond = () => ({ data: [prod(), prod({ id: "p2", name: "Eggs", sku: "EGG", stock_quantity: 0, is_active: false, price_paise: 9550 })], meta: { page: 1, pageSize: 20, total: 2 } });
    render(<AdminProductsList />);
    expect(screen.getByText("₹68")).toBeInTheDocument();
    expect(screen.getByText("₹95.50")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit toned milk/i })).toHaveAttribute("href", "/admin/products/p1");
    expect(screen.getByText("0")).toHaveClass("text-red-700"); // out-of-stock is highlighted
  });

  it("searches by text, resets to page 1 and strips characters the API rejects", async () => {
    render(<AdminProductsList />);
    await userEvent.type(screen.getByLabelText("Search products"), "  milk,(x) ");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(lastPath()).toBe("/admin/products?q=milkx&page=1&pageSize=20");
  });

  it("keeps non-Latin search text intact (Hindi vowel signs are combining marks)", async () => {
    render(<AdminProductsList />);
    await userEvent.type(screen.getByLabelText("Search products"), "दूध");
    await userEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(lastPath()).toContain(`q=${encodeURIComponent("दूध")}`);
  });

  it("shows loading, error and empty states", () => {
    respond = () => ({ loading: true });
    const a = render(<AdminProductsList />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading products/i);
    a.unmount();
    respond = () => ({ error: "Could not load products" });
    const b = render(<AdminProductsList />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load products");
    b.unmount();
    respond = () => ({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    render(<AdminProductsList />);
    expect(screen.getByText("No products found")).toBeInTheDocument();
    expect(screen.getByText("Create your first product.")).toBeInTheDocument();
  });

  it("activates or deactivates with a PATCH of the opposite flag, then reloads", async () => {
    respond = () => ({ data: [prod()], meta: { page: 1, pageSize: 20, total: 1 } });
    call.mockResolvedValue({ data: {} });
    render(<AdminProductsList />);
    await userEvent.click(screen.getByRole("button", { name: /deactivate toned milk/i }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(call).toHaveBeenCalledWith("/admin/products/p1", { method: "PATCH", body: { is_active: false } });
  });

  it("shows an error when a change fails and still refreshes to the true state", async () => {
    respond = () => ({ data: [prod({ is_active: false })], meta: { page: 1, pageSize: 20, total: 1 } });
    call.mockRejectedValue(new ApiError(409, "CONFLICT", "x"));
    render(<AdminProductsList />);
    await userEvent.click(screen.getByRole("button", { name: /^activate toned milk/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(reload).toHaveBeenCalled();
  });

  it("pages forwards and back", async () => {
    respond = () => ({ data: [prod()], meta: { page: 1, pageSize: 20, total: 45 } });
    render(<AdminProductsList />);
    expect(screen.getByText(/Page 1 of 3/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(lastPath()).toBe("/admin/products?page=2&pageSize=20");
  });
});

describe("AdminCategories", () => {
  const cat = (o: Partial<AdminCategory> = {}): AdminCategory => ({ id: UID, parent_id: null, slug: "dairy", name: "Dairy", image_path: null, sort_order: 1, is_active: true, ...o });

  it("lists categories, marks inactive ones and indents children", () => {
    respond = () => ({ data: [cat(), cat({ id: "c2", name: "Milk", slug: "milk", parent_id: UID, is_active: false })] });
    render(<AdminCategories />);
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.getByText("/dairy · order 1")).toBeInTheDocument();
  });

  it("validates the form: slug must be lowercase with hyphens", async () => {
    render(<AdminCategories />);
    await userEvent.type(screen.getByLabelText("Name"), "Fresh Fruit");
    await userEvent.type(screen.getByLabelText(/Slug/), "Fresh Fruit");
    await userEvent.click(screen.getByRole("button", { name: "Create category" }));
    expect(await screen.findByText(/lowercase letters, numbers and hyphens/i)).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it("creates a top-level category with a null parent and refreshes the list", async () => {
    call.mockResolvedValue({ data: {} });
    render(<AdminCategories />);
    await userEvent.type(screen.getByLabelText("Name"), "Fresh Fruit");
    await userEvent.type(screen.getByLabelText(/Slug/), "fresh-fruit");
    await userEvent.click(screen.getByRole("button", { name: "Create category" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(call).toHaveBeenCalledWith("/admin/categories", { method: "POST", body: { name: "Fresh Fruit", slug: "fresh-fruit", parent_id: null, sort_order: 0, is_active: true } });
  });

  it("shows the API message for a duplicate slug", async () => {
    call.mockRejectedValue(new ApiError(409, "CONFLICT", "A record with this unique value already exists"));
    render(<AdminCategories />);
    await userEvent.type(screen.getByLabelText("Name"), "Dairy");
    await userEvent.type(screen.getByLabelText(/Slug/), "dairy");
    await userEvent.click(screen.getByRole("button", { name: "Create category" }));
    expect(await screen.findByText("A record with this unique value already exists")).toBeInTheDocument();
  });

  it("edits an existing category with a pre-filled form and a PATCH, and cancel returns to create", async () => {
    respond = () => ({ data: [cat(), cat({ id: "c2", name: "Snacks", slug: "snacks" })] });
    call.mockResolvedValue({ data: {} });
    render(<AdminCategories />);
    await userEvent.click(screen.getByRole("button", { name: /edit dairy/i }));
    const form = screen.getByRole("form", { name: "Edit Dairy" });
    expect(within(form).getByLabelText("Name")).toHaveValue("Dairy");
    expect(within(form).getByLabelText(/Slug/)).toHaveValue("dairy");
    // a category cannot be its own parent
    expect(within(form).queryByRole("option", { name: "Dairy" })).not.toBeInTheDocument();
    expect(within(form).getByRole("option", { name: "Snacks" })).toBeInTheDocument();
    await userEvent.clear(within(form).getByLabelText("Name"));
    await userEvent.type(within(form).getByLabelText("Name"), "Dairy & Eggs");
    await userEvent.click(within(form).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(call).toHaveBeenCalledWith(`/admin/categories/${UID}`, { method: "PATCH", body: expect.objectContaining({ name: "Dairy & Eggs", slug: "dairy", parent_id: null }) });

    await userEvent.click(screen.getByRole("button", { name: /edit snacks/i }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("form", { name: "New category" })).toBeInTheDocument();
  });

  it("handles loading, error and empty states", () => {
    respond = () => ({ loading: true });
    const a = render(<AdminCategories />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading categories/i);
    a.unmount();
    respond = () => ({ error: "boom" });
    const b = render(<AdminCategories />);
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
    b.unmount();
    respond = () => ({ data: [] });
    render(<AdminCategories />);
    expect(screen.getByText("No categories yet")).toBeInTheDocument();
  });
});

describe("AdminOrdersBoard", () => {
  const order = (o: Partial<AdminOrder> = {}): AdminOrder => ({
    id: "abcdef12-0000-4000-8000-000000000000", user_id: "customer-1234", status: "pending", created_at: "2026-11-22T10:00:00Z",
    subtotal_paise: 18000, discount_paise: 0, delivery_fee_paise: 2500, total_paise: 20500, delivery_address: {}, ...o,
  });

  it("starts on pending orders", () => {
    render(<AdminOrdersBoard />);
    expect(lastPath()).toBe("/admin/orders?status=pending&page=1&pageSize=20");
  });

  it("lists orders as links to their detail page with total and a shortened customer id", () => {
    respond = () => ({ data: [order()], meta: { page: 1, pageSize: 20, total: 1 } });
    render(<AdminOrdersBoard />);
    const link = screen.getByRole("link", { name: /order #ABCDEF12/i });
    expect(link).toHaveAttribute("href", "/admin/orders/abcdef12-0000-4000-8000-000000000000");
    expect(link).toHaveTextContent("₹205");
    expect(link).toHaveTextContent("customer customer");
  });

  it("changes the status filter (All drops the parameter) and goes back to page 1", async () => {
    respond = () => ({ data: [order()], meta: { page: 1, pageSize: 20, total: 60 } });
    render(<AdminOrdersBoard />);
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(lastPath()).toBe("/admin/orders?status=pending&page=2&pageSize=20");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "");
    expect(lastPath()).toBe("/admin/orders?page=1&pageSize=20");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "delivered");
    expect(lastPath()).toBe("/admin/orders?status=delivered&page=1&pageSize=20");
  });

  it("shows loading, error and empty states", () => {
    respond = () => ({ loading: true });
    const a = render(<AdminOrdersBoard />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading orders/i);
    a.unmount();
    respond = () => ({ error: "nope" });
    const b = render(<AdminOrdersBoard />);
    expect(screen.getByRole("alert")).toHaveTextContent("nope");
    b.unmount();
    respond = () => ({ data: [], meta: { page: 1, pageSize: 20, total: 0 } });
    render(<AdminOrdersBoard />);
    expect(screen.getByText("No orders here")).toBeInTheDocument();
  });
});

describe("AdminOverview", () => {
  it("shows live counts from the list totals", () => {
    respond = (p) => ({ meta: { page: 1, pageSize: 1, total: p.includes("orders") ? 7 : 42 } });
    render(<AdminOverview />);
    expect(screen.getByRole("link", { name: /orders waiting for confirmation/i })).toHaveTextContent("7");
    expect(screen.getByRole("link", { name: /products/i })).toHaveTextContent("42");
    expect(paths).toContain("/admin/orders?status=pending&page=1&pageSize=1");
  });

  it("shows placeholders while loading and a dash on error", () => {
    respond = () => ({ loading: true });
    const a = render(<AdminOverview />);
    expect(screen.getAllByText("…").length).toBeGreaterThan(0);
    a.unmount();
    respond = () => ({ error: "x" });
    render(<AdminOverview />);
    expect(screen.getAllByText("–").length).toBe(2);
  });
});
