import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import type { Order } from "@/types/api";

const api = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), api: (...a: unknown[]) => api(...a) }));

let ordersState: { data?: Order[]; meta?: { page: number; pageSize: number; total: number }; error?: string; loading: boolean } = { loading: false };
const ordersPaths: string[] = [];
vi.mock("@/features/auth/use-api", () => ({
  useApiData: (path: string) => {
    ordersPaths.push(path);
    return { ...ordersState, reload: vi.fn() };
  },
  useAuthedApi: () => vi.fn(),
}));

import { attempt, cleanSearch, getCategories, getProduct, getProducts, parsePage } from "@/features/catalog/queries";
import { LocationProvider, useLocation } from "@/features/location/location-provider";
import { OrdersList, StatusBadge } from "@/features/orders/orders-list";

beforeEach(() => {
  api.mockReset();
  ordersPaths.length = 0;
  ordersState = { loading: false };
  window.localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("catalog queries", () => {
  it("getCategories returns the data array", async () => {
    api.mockResolvedValue({ data: [{ id: "c1" }] });
    expect(await getCategories()).toEqual([{ id: "c1" }]);
    expect(api).toHaveBeenCalledWith("/categories");
  });

  it("getProducts builds the query string (page size 24) and returns items with meta", async () => {
    api.mockResolvedValue({ data: [{ id: "p1" }], meta: { page: 2, pageSize: 24, total: 30 } });
    const res = await getProducts({ category: "dairy-eggs", q: "milk & eggs", page: 2 });
    expect(res).toEqual({ items: [{ id: "p1" }], meta: { page: 2, pageSize: 24, total: 30 } });
    const url = api.mock.calls[0]![0] as string;
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("category")).toBe("dairy-eggs");
    expect(params.get("q")).toBe("milk & eggs"); // encoded on the wire, decoded here
    expect(params.get("page")).toBe("2");
    expect(params.get("pageSize")).toBe("24");
  });

  it("getProducts omits absent filters and defaults to page 1", async () => {
    api.mockResolvedValue({ data: [], meta: { page: 1, pageSize: 24, total: 0 } });
    await getProducts({});
    const params = new URLSearchParams((api.mock.calls[0]![0] as string).split("?")[1]);
    expect([...params.keys()].sort()).toEqual(["page", "pageSize"]);
    expect(params.get("page")).toBe("1");
  });

  it("getProduct URL-encodes the id and turns 404 and 400 into null", async () => {
    api.mockResolvedValue({ data: { id: "p1" } });
    expect(await getProduct("a/b c")).toEqual({ id: "p1" });
    expect(api).toHaveBeenCalledWith("/products/a%2Fb%20c");
    api.mockRejectedValueOnce(new ApiError(404, "NOT_FOUND", "x"));
    expect(await getProduct("missing")).toBeNull();
    api.mockRejectedValueOnce(new ApiError(400, "VALIDATION_ERROR", "x"));
    expect(await getProduct("not-a-uuid")).toBeNull();
  });

  it("getProduct rethrows real failures so the page can show an error instead of a 404", async () => {
    api.mockRejectedValueOnce(new ApiError(500, "INTERNAL", "x"));
    await expect(getProduct("p1")).rejects.toMatchObject({ status: 500 });
    api.mockRejectedValueOnce(new ApiError(0, "NETWORK_ERROR", "x"));
    await expect(getProduct("p1")).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });

  it("attempt returns the value, or null instead of throwing", async () => {
    expect(await attempt(async () => 42)).toBe(42);
    expect(await attempt(async () => { throw new Error("x"); })).toBeNull();
  });

  it("parsePage and cleanSearch accept array query values and trim", () => {
    expect(parsePage(["4", "9"])).toBe(4);
    expect(parsePage(["x"])).toBe(1);
    expect(cleanSearch(["  milk ", "x"])).toBe("milk");
    expect(cleanSearch("पनीर टिक्का")).toBe("पनीर टिक्का"); // combining marks survive
    expect(cleanSearch("a<script>b</script>")).toBe("ascriptbscript");
  });
});

describe("getSupabase", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock("@supabase/supabase-js"); });

  async function load(env: Record<string, string>) {
    vi.resetModules();
    const createClient = vi.fn(() => ({ auth: {} }));
    vi.doMock("@supabase/supabase-js", () => ({ createClient }));
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const mod = await import("@/lib/supabase");
    return { getSupabase: mod.getSupabase, createClient };
  }

  it("explains a missing configuration instead of failing obscurely", async () => {
    const { getSupabase } = await load({ NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" });
    expect(() => getSupabase()).toThrow(/NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  });

  it("creates a single session-persisting client from the public values only", async () => {
    const { getSupabase, createClient } = await load({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc" });
    const a = getSupabase();
    const b = getSupabase();
    expect(a).toBe(b);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith("https://x.supabase.co", "sb_publishable_abc", { auth: { persistSession: true, autoRefreshToken: true } });
  });
});

describe("OrdersList", () => {
  const order = (o: Partial<Order> = {}): Order => ({
    id: "abcdef12-0000-4000-8000-000000000000", status: "pending", created_at: "2026-11-22T10:00:00Z", subtotal_paise: 18000, discount_paise: 0,
    delivery_fee_paise: 2500, total_paise: 20500, delivery_address: {}, ...o,
  });

  it("requests the first page of 10", () => {
    render(<OrdersList />);
    expect(ordersPaths[0]).toBe("/orders?page=1&pageSize=10");
  });

  it("handles loading and error states", () => {
    ordersState = { loading: true };
    const a = render(<OrdersList />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading your orders/i);
    a.unmount();
    ordersState = { loading: false, error: "Could not load orders" };
    render(<OrdersList />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load orders");
  });

  it("shows an empty state with a way to start shopping", () => {
    ordersState = { loading: false, data: [], meta: { page: 1, pageSize: 10, total: 0 } };
    render(<OrdersList />);
    expect(screen.getByText("No orders yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start shopping" })).toHaveAttribute("href", "/");
  });

  it("lists orders as links with id, date, total and status", () => {
    ordersState = { loading: false, data: [order(), order({ id: "11111111-0000-4000-8000-000000000000", status: "delivered", total_paise: 9950 })], meta: { page: 1, pageSize: 10, total: 2 } };
    render(<OrdersList />);
    const first = screen.getByRole("link", { name: /order #abcdef12/i });
    expect(first).toHaveAttribute("href", "/orders/abcdef12-0000-4000-8000-000000000000");
    expect(first).toHaveTextContent("₹205");
    expect(first).toHaveTextContent("Order placed");
    expect(screen.getByRole("link", { name: /order #11111111/i })).toHaveTextContent("Delivered");
    expect(screen.getByRole("link", { name: /order #11111111/i })).toHaveTextContent("₹99.50");
  });

  it("pages through results", async () => {
    ordersState = { loading: false, data: [order()], meta: { page: 1, pageSize: 10, total: 25 } };
    render(<OrdersList />);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(ordersPaths[ordersPaths.length - 1]).toBe("/orders?page=2&pageSize=10");
  });

  it("StatusBadge uses a distinct tone for cancelled and delivered orders", () => {
    const { container, rerender } = render(<StatusBadge status="cancelled" />);
    expect(container.firstChild).toHaveClass("text-red-800");
    rerender(<StatusBadge status="delivered" />);
    expect(container.firstChild).toHaveClass("text-emerald-800");
    rerender(<StatusBadge status="packed" />);
    expect(container.firstChild).toHaveClass("text-amber-900");
  });
});

describe("LocationProvider", () => {
  const SERVICEABLE = { data: { pincode: "560001", serviceable: true, area_name: "MG Road", city: "Bengaluru", delivery_fee_paise: 2500, min_order_paise: 9900 } };
  const wrapper = ({ children }: { children: ReactNode }) => <LocationProvider>{children}</LocationProvider>;

  it("ignores a corrupt stored pincode without calling the API", async () => {
    window.localStorage.setItem("swiftcart.pincode", "abc");
    const { result } = renderHook(() => useLocation(), { wrapper });
    await Promise.resolve();
    expect(api).not.toHaveBeenCalled();
    expect(result.current.pincode).toBeNull();
  });

  it("choose validates before any request", async () => {
    const { result } = renderHook(() => useLocation(), { wrapper });
    let outcome: { error?: string } = {};
    await act(async () => { outcome = await result.current.choose("12"); });
    expect(outcome.error).toBe("Enter a valid 6-digit pincode");
    expect(api).not.toHaveBeenCalled();
  });

  it("choose remembers a valid pincode and returns the serviceability result", async () => {
    api.mockResolvedValue(SERVICEABLE);
    const { result } = renderHook(() => useLocation(), { wrapper });
    let outcome: { info?: { serviceable: boolean } } = {};
    await act(async () => { outcome = await result.current.choose(" 560001 "); });
    expect(outcome.info?.serviceable).toBe(true);
    expect(api).toHaveBeenCalledWith("/serviceability/560001");
    expect(result.current).toMatchObject({ pincode: "560001", status: "ready" });
    expect(window.localStorage.getItem("swiftcart.pincode")).toBe("560001");
  });

  it("a network failure surfaces a friendly message and an error status", async () => {
    api.mockRejectedValue(new ApiError(0, "NETWORK_ERROR", "x"));
    const { result } = renderHook(() => useLocation(), { wrapper });
    let outcome: { error?: string } = {};
    await act(async () => { outcome = await result.current.choose("560001"); });
    expect(outcome.error).toMatch(/could not check this pincode/i);
    expect(result.current.status).toBe("error");
    expect(window.localStorage.getItem("swiftcart.pincode")).toBeNull();
  });

  it("clear forgets the pincode everywhere", async () => {
    api.mockResolvedValue(SERVICEABLE);
    const { result } = renderHook(() => useLocation(), { wrapper });
    await act(async () => { await result.current.choose("560001"); });
    act(() => result.current.clear());
    expect(result.current).toMatchObject({ pincode: null, info: null, status: "idle" });
    expect(window.localStorage.getItem("swiftcart.pincode")).toBeNull();
  });

  it("keeps working when browser storage is blocked (private mode)", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    api.mockResolvedValue(SERVICEABLE);
    const { result } = renderHook(() => useLocation(), { wrapper });
    await act(async () => { await result.current.choose("560001"); });
    await waitFor(() => expect(result.current.pincode).toBe("560001"));
  });

  it("a failed restore leaves the picker unselected instead of erroring", async () => {
    window.localStorage.setItem("swiftcart.pincode", "560001");
    api.mockRejectedValue(new ApiError(500, "INTERNAL", "x"));
    const { result } = renderHook(() => useLocation(), { wrapper });
    await waitFor(() => expect(api).toHaveBeenCalled());
    expect(result.current.pincode).toBeNull();
    expect(result.current.status).toBe("idle");
  });

  it("useLocation outside a provider is a programming error", () => {
    expect(() => renderHook(() => useLocation())).toThrow(/inside <LocationProvider>/);
  });
});
