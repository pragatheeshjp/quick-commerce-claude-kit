"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import { pincodeSchema } from "@/lib/validation";
import type { Serviceability } from "@/types/api";

const STORAGE_KEY = "swiftcart.pincode";

type Status = "idle" | "checking" | "ready" | "error";

interface LocationContextValue {
  pincode: string | null;
  info: Serviceability | null;
  status: Status;
  /** Validates, checks serviceability via the API and remembers the pincode. */
  choose: (pincode: string) => Promise<{ error?: string; info?: Serviceability }>;
  clear: () => void;
}

const LocationContext = createContext<LocationContextValue | null>(null);

function readStored(): string | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && pincodeSchema.safeParse(v).success ? v : null;
  } catch {
    return null; // storage can be blocked (private mode)
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [pincode, setPincode] = useState<string | null>(null);
  const [info, setInfo] = useState<Serviceability | null>(null);
  const [status, setStatus] = useState<Status>("idle");

  const apply = useCallback((code: string, data: Serviceability) => {
    setInfo(data);
    setPincode(code);
    setStatus("ready");
    try { window.localStorage.setItem(STORAGE_KEY, code); } catch { /* ignore */ }
  }, []);

  const lookup = useCallback(async (code: string): Promise<{ error?: string; info?: Serviceability }> => {
    setStatus("checking");
    try {
      const data = (await api<Serviceability>(`/serviceability/${code}`)).data;
      apply(code, data);
      return { info: data };
    } catch {
      setStatus("error");
      return { error: "Could not check this pincode right now. Please try again." };
    }
  }, [apply]);

  // Restore the remembered pincode after mount (avoids server/client markup mismatch).
  // State is only set after the awaited request, never synchronously inside the effect.
  useEffect(() => {
    const stored = readStored();
    if (!stored) return;
    let cancelled = false;
    api<Serviceability>(`/serviceability/${stored}`)
      .then((res) => { if (!cancelled) apply(stored, res.data); })
      .catch(() => { /* stay on "select location" */ });
    return () => { cancelled = true; };
  }, [apply]);
  const value = useMemo<LocationContextValue>(
    () => ({
      pincode,
      info,
      status,
      async choose(code) {
        const parsed = pincodeSchema.safeParse(code.trim());
        if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid pincode" };
        return lookup(parsed.data);
      },
      clear() {
        setPincode(null);
        setInfo(null);
        setStatus("idle");
        try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      },
    }),
    [pincode, info, status, lookup],
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useLocation must be used inside <LocationProvider>");
  return ctx;
}


