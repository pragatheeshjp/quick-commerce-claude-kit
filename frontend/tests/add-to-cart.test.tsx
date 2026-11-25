import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), usePathname: () => "/product/p1" }));
const auth = { user: { id: "u1" } as unknown, loading: false };
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => auth }));
const cart = { quantityOf: vi.fn(() => 0), setQuantity: vi.fn(), busy: new Set<string>() };
vi.mock("@/features/cart/cart-provider", () => ({ useCart: () => cart }));

import { AddToCart } from "@/features/cart/add-to-cart";

const setup = () => render(<AddToCart productId="p1" productName="Toned Milk" inStock />);

beforeEach(() => {
  push.mockReset();
  cart.quantityOf.mockReset().mockReturnValue(0);
  cart.setQuantity.mockReset().mockResolvedValue({});
  cart.busy = new Set();
  auth.user = { id: "u1" };
  auth.loading = false;
});

describe("AddToCart", () => {
  it("adds one item when signed in", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Add Toned Milk to cart" }));
    expect(cart.setQuantity).toHaveBeenCalledWith("p1", 1);
  });

  it("sends signed-out visitors to log in and returns them to the product", async () => {
    auth.user = null;
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Add Toned Milk to cart" }));
    expect(push).toHaveBeenCalledWith("/login?next=%2Fproduct%2Fp1");
    expect(cart.setQuantity).not.toHaveBeenCalled();
  });

  it("shows a stepper when already in the cart and changes quantity by one", async () => {
    cart.quantityOf.mockReturnValue(2);
    setup();
    expect(screen.getByText("2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Increase quantity of Toned Milk" }));
    expect(cart.setQuantity).toHaveBeenLastCalledWith("p1", 3);
    await userEvent.click(screen.getByRole("button", { name: "Decrease quantity of Toned Milk" }));
    expect(cart.setQuantity).toHaveBeenLastCalledWith("p1", 1);
  });

  it("removes the line when decreasing from 1 (quantity 0)", async () => {
    cart.quantityOf.mockReturnValue(1);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Decrease quantity of Toned Milk" }));
    expect(cart.setQuantity).toHaveBeenCalledWith("p1", 0);
  });

  it("caps at 50 and shows the server's stock message", async () => {
    cart.quantityOf.mockReturnValue(50);
    const { unmount } = setup();
    expect(screen.getByRole("button", { name: "Increase quantity of Toned Milk" })).toBeDisabled();
    unmount();

    cart.quantityOf.mockReturnValue(0);
    cart.setQuantity.mockResolvedValue({ error: "Only 2 left in stock." });
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Add Toned Milk to cart" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only 2 left in stock.");
  });

  it("is not purchasable when out of stock", () => {
    render(<AddToCart productId="p1" productName="Toned Milk" inStock={false} />);
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("disables controls while a request is in flight", () => {
    cart.busy = new Set(["p1"]);
    setup();
    expect(screen.getByRole("button", { name: /add toned milk/i })).toBeDisabled();
  });
});
