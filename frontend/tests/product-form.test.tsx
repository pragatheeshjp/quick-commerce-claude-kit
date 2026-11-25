import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { AdminCategory, AdminProduct } from "@/types/api";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const call = vi.fn();
const categories: AdminCategory[] = [
  { id: "11111111-1111-4111-8111-111111111111", parent_id: null, slug: "dairy", name: "Dairy", image_path: null, sort_order: 0, is_active: true },
];
vi.mock("@/features/auth/use-api", () => ({
  useAuthedApi: () => call,
  useApiData: () => ({ data: categories, error: undefined, loading: false, reload: vi.fn(), meta: undefined }),
}));

import { ProductForm, StockAdjuster } from "@/features/admin/product-form";

const product: AdminProduct = {
  id: "p1", category_id: categories[0]!.id, sku: "MLK-1", name: "Toned Milk", description: null, brand: "Farm", unit_label: "1 L",
  price_paise: 6850, mrp_paise: 7000, stock_quantity: 12, image_url: null, is_active: true,
};

beforeEach(() => {
  call.mockReset();
  push.mockReset();
});

async function fillNew(over: { price?: string; mrp?: string } = {}) {
  await userEvent.selectOptions(screen.getByLabelText("Category"), categories[0]!.id);
  await userEvent.type(screen.getByLabelText("Name"), "Butter");
  await userEvent.type(screen.getByLabelText("SKU"), "BTR-100");
  await userEvent.type(screen.getByLabelText(/Pack size/), "100 g");
  await userEvent.type(screen.getByLabelText(/Selling price/), over.price ?? "55.50");
  await userEvent.type(screen.getByLabelText(/MRP/), over.mrp ?? "60");
}

describe("ProductForm (create)", () => {
  it("shows inline errors for an empty form and sends nothing", async () => {
    render(<ProductForm />);
    await userEvent.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("Choose a category")).toBeInTheDocument();
    expect(screen.getByText("Enter a name")).toBeInTheDocument();
    expect(screen.getByText("Enter a SKU")).toBeInTheDocument();
    expect(screen.getAllByText(/Enter a valid (price|MRP)/)).toHaveLength(2);
    expect(call).not.toHaveBeenCalled();
  });

  it("converts rupees to integer paise and sends opening stock", async () => {
    call.mockResolvedValue({ data: {} });
    render(<ProductForm />);
    await fillNew();
    await userEvent.clear(screen.getByLabelText("Opening stock"));
    await userEvent.type(screen.getByLabelText("Opening stock"), "25");
    await userEvent.click(screen.getByRole("button", { name: "Create product" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/products"));
    expect(call).toHaveBeenCalledWith("/admin/products", {
      method: "POST",
      body: {
        category_id: categories[0]!.id, name: "Butter", sku: "BTR-100", unit_label: "100 g",
        brand: null, description: null, price_paise: 5550, mrp_paise: 6000, is_active: true, initial_stock: 25,
      },
    });
  });

  it("blocks an MRP below the selling price", async () => {
    render(<ProductForm />);
    await fillNew({ price: "70", mrp: "60" });
    await userEvent.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("MRP cannot be lower than the price")).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it("rejects non-money price text", async () => {
    render(<ProductForm />);
    await fillNew({ price: "12.345" });
    await userEvent.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText(/Enter a valid price/)).toBeInTheDocument();
    expect(call).not.toHaveBeenCalled();
  });

  it("shows a friendly error for a duplicate SKU and stays on the page", async () => {
    call.mockRejectedValue(new ApiError(409, "CONFLICT", "A record with this unique value already exists"));
    render(<ProductForm />);
    await fillNew();
    await userEvent.click(screen.getByRole("button", { name: "Create product" }));
    expect(await screen.findByText("A record with this unique value already exists")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});

describe("ProductForm (edit)", () => {
  it("pre-fills rupees from paise, never offers opening stock, and PATCHes without stock", async () => {
    call.mockResolvedValue({ data: {} });
    render(<ProductForm product={product} />);
    expect(screen.getByLabelText(/Selling price/)).toHaveValue("68.50");
    expect(screen.getByLabelText(/MRP/)).toHaveValue("70");
    expect(screen.queryByLabelText("Opening stock")).not.toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/Selling price/));
    await userEvent.type(screen.getByLabelText(/Selling price/), "65");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    const [path, opts] = call.mock.calls[0]!;
    expect(path).toBe("/admin/products/p1");
    expect(opts.method).toBe("PATCH");
    expect(opts.body.price_paise).toBe(6500);
    expect(opts.body).not.toHaveProperty("initial_stock");
    expect(opts.body).not.toHaveProperty("stock_quantity");
  });
});

describe("StockAdjuster", () => {
  it("sends a signed integer delta and reason", async () => {
    call.mockResolvedValue({ data: { stock_quantity: 9 } });
    const onChanged = vi.fn();
    render(<StockAdjuster productId="p1" current={12} onChanged={onChanged} />);
    await userEvent.type(screen.getByLabelText(/Change/), "-3");
    await userEvent.selectOptions(screen.getByLabelText("Reason"), "adjustment");
    await userEvent.click(screen.getByRole("button", { name: "Apply change" }));
    expect(await screen.findByText("Stock is now 9.")).toBeInTheDocument();
    expect(call).toHaveBeenCalledWith("/admin/products/p1/stock", { method: "POST", body: { delta: -3, reason: "adjustment" } });
    expect(onChanged).toHaveBeenCalled();
  });

  it("rejects zero, decimals and text locally", async () => {
    render(<StockAdjuster productId="p1" current={12} onChanged={vi.fn()} />);
    for (const bad of ["0", "1.5", "abc"]) {
      await userEvent.clear(screen.getByLabelText(/Change/));
      await userEvent.type(screen.getByLabelText(/Change/), bad);
      await userEvent.click(screen.getByRole("button", { name: "Apply change" }));
      expect(await screen.findByRole("alert")).toBeInTheDocument();
    }
    expect(call).not.toHaveBeenCalled();
  });

  it("explains insufficient stock from the API", async () => {
    call.mockRejectedValue(new ApiError(409, "INSUFFICIENT_STOCK", "Insufficient stock"));
    render(<StockAdjuster productId="p1" current={2} onChanged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText(/Change/), "-50");
    await userEvent.click(screen.getByRole("button", { name: "Apply change" }));
    expect(await screen.findByText(/not enough stock to remove/i)).toBeInTheDocument();
  });
});


