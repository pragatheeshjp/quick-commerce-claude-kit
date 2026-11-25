"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import type { PageMeta } from "@/types/api";

type State<T> = { path: string | null; data?: T; meta?: PageMeta; error?: string };

/** Authenticated GET. `loading` is true until the response for the *current* path arrives. */
export function useApiData<T>(path: string | null) {
  const { getAccessToken } = useAuth();
  const [state, setState] = useState<State<T>>({ path: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await api<T>(path, { token });
        if (!cancelled) setState({ path, data: res.data, meta: res.meta });
      } catch (err) {
        if (!cancelled) setState({ path, error: describeApiError(err) });
      }
    })();
    return () => { cancelled = true; };
  }, [path, tick, getAccessToken]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const loading = path !== null && state.path !== path;
  return { data: loading ? undefined : state.data, meta: loading ? undefined : state.meta, error: loading ? undefined : state.error, loading, reload };
}

/** Returns a function that performs authenticated requests (used for mutations). */
export function useAuthedApi() {
  const { getAccessToken } = useAuth();
  return useCallback(
    async <T,>(path: string, opts: Omit<Parameters<typeof api>[1] & object, "token"> = {}) =>
      api<T>(path, { ...opts, token: await getAccessToken() }),
    [getAccessToken],
  );
}
