import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";

const respond = (status: number, body?: unknown) =>
  vi.fn(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("calls /api/v1, returns data and meta, and attaches the bearer token", async () => {
    const fetchMock = respond(200, { success: true, data: [1], meta: { page: 1, pageSize: 20, total: 1 } });
    vi.stubGlobal("fetch", fetchMock);
    const res = await api<number[]>("/products", { token: "tok" });
    expect(res.data).toEqual([1]);
    expect(res.meta?.total).toBe(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/products$/);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("sends JSON bodies with a content type and no auth header when signed out", async () => {
    const fetchMock = respond(200, { success: true, data: {} });
    vi.stubGlobal("fetch", fetchMock);
    await api("/x", { method: "POST", body: { a: 1 } });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBeUndefined();
    expect(init.body).toBe('{"a":1}');
  });

  it("maps the API error envelope to ApiError", async () => {
    vi.stubGlobal("fetch", respond(409, { success: false, error: { code: "INSUFFICIENT_STOCK", message: "Only 2 left", details: { available_quantity: 2 } } }));
    const err = await api("/cart").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "INSUFFICIENT_STOCK", message: "Only 2 left", details: { available_quantity: 2 } });
  });

  it("reports network failures and bad responses with friendly errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    expect(await api("/x").catch((e) => e)).toMatchObject({ code: "NETWORK_ERROR", status: 0 });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>oops</html>", { status: 502 })));
    expect(await api("/x").catch((e) => e)).toMatchObject({ code: "BAD_RESPONSE", status: 502 });
  });

  it("handles 204 No Content", async () => {
    vi.stubGlobal("fetch", respond(204));
    expect((await api("/x", { method: "DELETE" })).data).toBeUndefined();
  });
});
