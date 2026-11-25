/* eslint-disable @typescript-eslint/no-explicit-any -- a dynamic Proxy test double is inherently untyped */
import { vi } from "vitest";

export interface FakeResult {
  data?: unknown;
  error?: { code?: string; message: string; details?: string } | null;
  count?: number | null;
}

export interface FakeQuery {
  /** Every builder call made on this query, in order: [method, args]. */
  calls: [string, unknown[]][];
  /** First recorded call with this method name (or undefined). */
  call(method: string): unknown[] | undefined;
}

/**
 * A stand-in for a supabase-js query builder. Any chained method (select, eq, in, order, range, ...) returns the
 * same object and is recorded; awaiting it (or the result of maybeSingle()/single()) resolves to `result`.
 */
export function fakeQuery(result: FakeResult = {}): FakeQuery & any {
  const calls: [string, unknown[]][] = [];
  const settled = { data: null, error: null, count: null, ...result };
  const q: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(settled).then(res, rej);
        if (prop === "calls") return calls;
        if (prop === "call") return (m: string) => calls.find(([name]) => name === m)?.[1];
        return (...args: unknown[]) => {
          calls.push([prop, args]);
          return q;
        };
      },
    },
  );
  return q;
}

/** Shape of the mocked `supabaseAdmin` export used by `vi.mock("../src/lib/supabase.js", ...)`. */
export function makeSupabaseMock() {
  return { from: vi.fn(), rpc: vi.fn() };
}
