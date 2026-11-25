"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { primaryButton, TextField } from "@/components/text-field";
import { fieldErrors, resetSchema } from "@/lib/validation";
import { useAuth } from "./auth-provider";

/** The emailed link signs the user in with a recovery session; only then can a new password be set. */
export function ResetPasswordForm() {
  const { user, loading, updatePassword } = useAuth();
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const parsed = resetSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const { error } = await updatePassword(parsed.data.password);
    setBusy(false);
    if (error) return setFormError(error);
    router.replace("/account");
  }

  if (loading) return <p role="status" className="text-zinc-500">Loading…</p>;
  if (!user) {
    return (
      <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">
        This reset link is invalid or has expired. <Link href="/forgot-password" className="underline">Request a new one</Link>.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <TextField label="New password" name="password" type="password" autoComplete="new-password" error={errors.password} />
      <TextField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" error={errors.confirmPassword} />
      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Saving…" : "Set new password"}</button>
    </form>
  );
}
