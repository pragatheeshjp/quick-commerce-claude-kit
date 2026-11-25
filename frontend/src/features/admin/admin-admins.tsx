"use client";

import { useState, type FormEvent } from "react";
import { ErrorNotice } from "@/components/feedback";
import { primaryButton, TextField } from "@/components/text-field";
import { useAuth } from "@/features/auth/auth-provider";
import { useApiData, useAuthedApi } from "@/features/auth/use-api";
import { describeApiError } from "@/lib/errors";
import { fieldErrors, grantAdminSchema } from "@/lib/validation";
import type { AdminUser } from "@/types/api";

export function AdminAdmins() {
  const { user } = useAuth();
  const call = useAuthedApi();
  const { data, error, loading, reload } = useApiData<AdminUser[]>("/admin/admins");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onGrant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    setActionError(null);
    const form = e.currentTarget;
    const parsed = grantAdminSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      await call("/admin/admins", { method: "POST", body: { email: parsed.data.email } });
      setMessage(`${parsed.data.email} is now an admin.`);
      form.reset();
      reload();
    } catch (err) {
      setActionError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setActionError(null);
    setBusy(true);
    try {
      await call(`/admin/admins/${id}`, { method: "DELETE" });
      setConfirmId(null);
      reload();
    } catch (err) {
      setActionError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        <h2 className="text-xl font-bold">Administrators</h2>
        {loading && <p role="status" className="text-zinc-500">Loading admins…</p>}
        {error && <ErrorNotice message={error} />}
        {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}
        {data && (
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
            {data.map((a) => {
              const isMe = a.user_id === user?.id;
              return (
                <li key={a.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <p className="font-medium">{a.email} {isMe && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">You</span>}</p>
                  {isMe ? (
                    <span className="text-xs text-zinc-500">You cannot remove yourself</span>
                  ) : confirmId === a.user_id ? (
                    <span role="alertdialog" aria-label={`Confirm removing ${a.email}`} className="flex items-center gap-2 text-sm">
                      Remove admin access?
                      <button type="button" disabled={busy} onClick={() => revoke(a.user_id)} className="rounded-lg bg-red-700 px-3 py-1 font-semibold text-white disabled:opacity-60">Yes, remove</button>
                      <button type="button" disabled={busy} onClick={() => setConfirmId(null)} className="rounded-lg border border-zinc-300 bg-white px-3 py-1 font-semibold">Keep</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmId(a.user_id)} className="text-sm text-zinc-600 underline hover:text-red-700">Remove{" "}<span className="sr-only">{a.email}</span></button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form onSubmit={onGrant} noValidate aria-label="Add an admin" className="h-fit space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <h3 className="font-bold">Add an admin</h3>
        <p className="text-sm text-zinc-600">They must already have a Swiftcart account. Admins can manage products, orders and other admins.</p>
        <TextField label="Their email" name="email" type="email" autoComplete="off" error={errors.email} />
        {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
        <button type="submit" disabled={busy} className={primaryButton}>Make admin</button>
      </form>
    </div>
  );
}

