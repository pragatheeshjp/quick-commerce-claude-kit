import type { ApiEnvelope } from "@/types/api";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Base URL differs by where the code runs: the browser uses the public URL, while server rendering
 * inside Docker must use the internal service name (API_INTERNAL_URL=http://backend:4000).
 */
export function apiBaseUrl(): string {
  const isServer = typeof window === "undefined";
  const url = (isServer && process.env.API_INTERNAL_URL) || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  return url.replace(/\/+$/, "");
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Supabase access token. The API derives the user from it; never send user ids yourself. */
  token?: string | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/** The single entry point to the Express API: base URL, auth header and error handling live here. */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const headers: Record<string, string> = { Accept: "application/json", ...opts.headers };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  let res: Response;
  try {
    res = await fetch(`${apiBaseUrl()}/api/v1${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check your connection and try again.");
  }

  if (res.status === 204) return { success: true, data: undefined as T };

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(res.status, "BAD_RESPONSE", "Unexpected response from the server.");
  }

  const body = json as { success?: boolean; error?: { code: string; message: string; details?: unknown } };
  if (!res.ok || body.success === false) {
    throw new ApiError(
      res.status,
      body.error?.code ?? "UNKNOWN",
      body.error?.message ?? "Something went wrong.",
      body.error?.details,
    );
  }
  return json as ApiEnvelope<T>;
}
