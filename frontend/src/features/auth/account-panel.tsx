"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ErrorNotice } from "@/components/feedback";
import { useAuth } from "@/features/auth/auth-provider";
import { api } from "@/lib/api";
import type { Me } from "@/types/api";

export function AccountPanel() {
  const { getAccessToken, signOut } = useAuth();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const token = await getAccessToken();
        const res = await api<Me>("/me", { token, signal: controller.signal });
        setMe(res.data);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [getAccessToken]);

  async function onSignOut() {
    await signOut();
    router.replace("/");
  }

  if (failed) return <ErrorNotice message="We could not load your account. Please refresh." />;
  if (!me) return <p role="status" className="text-zinc-500">Loading your account…</p>;

  return (
    <div className="space-y-6">
      <dl className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
        <div className="flex justify-between px-4 py-3"><dt className="text-zinc-600">Name</dt><dd className="font-medium">{me.profile?.full_name ?? "—"}</dd></div>
        <div className="flex justify-between px-4 py-3"><dt className="text-zinc-600">Email</dt><dd className="font-medium">{me.email}</dd></div>
        <div className="flex justify-between px-4 py-3"><dt className="text-zinc-600">Account type</dt><dd className="font-medium capitalize">{me.role}</dd></div>
      </dl>
      <nav aria-label="Account sections" className="grid gap-3 sm:grid-cols-2">
        <Link href="/orders" className="rounded-2xl border border-zinc-200 bg-white p-4 font-semibold hover:border-emerald-500">Your orders</Link>
        <Link href="/account/addresses" className="rounded-2xl border border-zinc-200 bg-white p-4 font-semibold hover:border-emerald-500">Saved addresses</Link>
      </nav>
      {me.role === "admin" && (
        <Link href="/admin" className="block rounded-2xl border border-emerald-300 bg-emerald-50 p-4 font-semibold text-emerald-900 hover:bg-emerald-100">
          Open the admin console →
        </Link>
      )}
      <button onClick={onSignOut} className="rounded-xl border border-zinc-300 bg-white px-5 py-2.5 font-semibold hover:bg-zinc-50">
        Log out
      </button>
    </div>
  );
}


