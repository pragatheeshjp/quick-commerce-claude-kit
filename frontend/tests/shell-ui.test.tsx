import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState: { user: unknown; loading: boolean } = { user: null, loading: false };
vi.mock("@/features/auth/auth-provider", () => ({ useAuth: () => authState }));
const cartState = { itemCount: 0 };
vi.mock("@/features/cart/cart-provider", () => ({ useCart: () => cartState }));
vi.mock("@/features/location/location-picker", () => ({ LocationPicker: () => <button>Select location</button> }));
let pathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/features/auth/require-auth", () => ({ RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/features/auth/use-api", () => ({ useApiData: () => ({ data: undefined, error: undefined, loading: true }), useAuthedApi: () => vi.fn() }));

import { AdminNav } from "@/features/admin/admin-shell";
import { EmptyState, ErrorNotice, ProductGridSkeleton } from "@/components/feedback";
import { Header } from "@/components/header";
import { Pagination } from "@/components/pagination";
import { TextField } from "@/components/text-field";

beforeEach(() => {
  Object.assign(authState, { user: null, loading: false });
  cartState.itemCount = 0;
  pathname = "/admin";
});

describe("Header", () => {
  it("offers log in to guests and Account to signed-in users", () => {
    const { unmount } = render(<Header />);
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: "Account" })).not.toBeInTheDocument();
    unmount();
    authState.user = { id: "u1" };
    render(<Header />);
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
  });

  it("shows neither link while the session is loading (no flash of the wrong state)", () => {
    authState.loading = true;
    render(<Header />);
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Account" })).not.toBeInTheDocument();
  });

  it("shows the cart count only when the cart has items, with an accessible label", () => {
    const { unmount } = render(<Header />);
    expect(screen.getByRole("link", { name: "Cart" })).toHaveAttribute("href", "/cart");
    unmount();
    cartState.itemCount = 3;
    render(<Header />);
    expect(screen.getByRole("link", { name: /cart 3 items in cart/i })).toBeInTheDocument();
  });

  it("has a search form that works without JavaScript (GET /search?q=)", () => {
    render(<Header />);
    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/search");
    const input = within(form).getByLabelText("Search products");
    expect(input).toHaveAttribute("name", "q");
    expect(input).toHaveAttribute("maxlength", "60");
  });

  it("links the brand to the home page and includes the location picker", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: "Swiftcart" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "Select location" })).toBeInTheDocument();
  });
});

describe("Pagination", () => {
  const meta = (page: number, total = 100, pageSize = 20) => ({ page, pageSize, total });

  it("renders nothing for a single page", () => {
    const { container } = render(<Pagination meta={meta(1, 15)} basePath="/search?q=milk" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links to the neighbouring pages, appending to an existing query string", () => {
    render(<Pagination meta={meta(2)} basePath="/search?q=milk" />);
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("href", "/search?q=milk&page=1");
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/search?q=milk&page=3");
    expect(screen.getByText("Page 2 of 5")).toBeInTheDocument();
  });

  it("uses ? when the base path has no query, and hides links past the ends", () => {
    const { unmount } = render(<Pagination meta={meta(1)} basePath="/category/dairy" />);
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/category/dairy?page=2");
    expect(screen.queryByRole("link", { name: "Previous" })).not.toBeInTheDocument();
    unmount();
    render(<Pagination meta={meta(5)} basePath="/category/dairy" />);
    expect(screen.queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
  });
});

describe("feedback components", () => {
  it("ErrorNotice is announced and has a sensible default message", () => {
    const { unmount } = render(<ErrorNotice />);
    expect(screen.getByRole("alert")).toHaveTextContent(/could not load this right now/i);
    unmount();
    render(<ErrorNotice message="Custom problem" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Custom problem");
  });

  it("EmptyState shows a title and optional hint", () => {
    const { unmount } = render(<EmptyState title="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    unmount();
    render(<EmptyState title="Nothing here" hint="Try later" />);
    expect(screen.getByText("Try later")).toBeInTheDocument();
  });

  it("the skeleton is hidden from assistive tech and renders the requested count", () => {
    render(<ProductGridSkeleton count={3} />);
    const list = document.querySelector("ul")!;
    expect(list).toHaveAttribute("aria-hidden", "true");
    expect(list.children).toHaveLength(3);
  });
});

describe("TextField", () => {
  it("associates the label and exposes errors accessibly", () => {
    render(<TextField label="Email" name="email" error="Enter your email" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const msg = screen.getByRole("alert");
    expect(msg).toHaveTextContent("Enter your email");
    expect(input.getAttribute("aria-describedby")).toBe(msg.id);
  });

  it("has no error semantics when valid, and passes through input props", () => {
    render(<TextField label="Pincode" name="pincode" maxLength={6} inputMode="numeric" />);
    const input = screen.getByLabelText("Pincode");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).toHaveAttribute("maxlength", "6");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AdminNav", () => {
  it("marks the current section with aria-current", () => {
    pathname = "/admin/products/new";
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Products" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Orders" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("Overview is active only on the exact /admin path", () => {
    pathname = "/admin";
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Admins" })).toHaveAttribute("href", "/admin/admins");
  });
});
