import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/cart/add-to-cart", () => ({ AddToCart: ({ productName }: { productName: string }) => <button>Add {productName}</button> }));
import { ProductCard, ProductGrid } from "@/components/product-card";
import type { Product } from "@/types/api";

const product: Product = {
  id: "p1", category_id: "c1", sku: "S1", name: "Toned Milk", description: null, brand: "FarmFresh",
  unit_label: "1 L", price_paise: 6800, mrp_paise: 8000, in_stock: true, image_url: null,
};

describe("ProductCard", () => {
  it("shows name, unit, price, struck MRP and discount, linking to the product", () => {
    render(<ul><ProductCard product={product} /></ul>);
    expect(screen.getByRole("link", { name: "Toned Milk" })).toHaveAttribute("href", "/product/p1");
    expect(screen.getByText("1 L")).toBeInTheDocument();
    expect(screen.getByText("₹68")).toBeInTheDocument();
    expect(screen.getByText("₹80")).toBeInTheDocument();
    expect(screen.getByText("15% OFF")).toBeInTheDocument();
  });
  it("marks out-of-stock items and hides the discount badge", () => {
    render(<ul><ProductCard product={{ ...product, in_stock: false }} /></ul>);
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.queryByText("15% OFF")).not.toBeInTheDocument();
  });
  it("omits MRP when there is no saving", () => {
    render(<ul><ProductCard product={{ ...product, mrp_paise: 6800 }} /></ul>);
    expect(screen.queryByText(/MRP/)).not.toBeInTheDocument();
  });
});

describe("ProductGrid", () => {
  it("renders one card per product, in order, each with its own add-to-cart control", () => {
    const products = [product, { ...product, id: "p2", name: "Eggs" }, { ...product, id: "p3", name: "Bananas" }];
    render(<ProductGrid products={products} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items.map((li) => li.querySelector("h3")?.textContent)).toEqual(["Toned Milk", "Eggs", "Bananas"]);
    expect(screen.getByRole("button", { name: "Add Eggs" })).toBeInTheDocument();
  });

  it("renders an empty list without errors", () => {
    render(<ProductGrid products={[]} />);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("shows the first letter as a placeholder when there is no image", () => {
    render(<ProductGrid products={[{ ...product, name: "eggs" }]} />);
    expect(screen.getByText("E")).toBeInTheDocument();
  });
});