"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "./auth-provider";

/**
 * Client-side route guard for UX only: it redirects signed-out visitors to login.
 * Real authorization happens in the Express API on every request.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return <p role="status" className="py-16 text-center text-zinc-500">Loading…</p>;
  }
  return <>{children}</>;
}

/** Only same-site relative paths are allowed as post-login redirects (prevents open redirects). */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  return next;
}
