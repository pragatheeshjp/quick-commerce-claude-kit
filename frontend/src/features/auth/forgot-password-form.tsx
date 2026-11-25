"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { primaryButton, TextField } from "@/components/text-field";
import { fieldErrors, forgotSchema } from "@/lib/validation";
import { useAuth } from "./auth-provider";

export function ForgotPasswordForm() {
  const { sendPasswordReset } = useAuth();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const parsed = forgotSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const { error } = await sendPasswordReset(parsed.data.email);
    setBusy(false);
    if (error) return setFormError(error);
    setSent(true);
  }

  if (sent) {
    // Same message whether or not the email exists, so accounts cannot be enumerated.
    return (
      <div role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">
        If an account exists for that email, we have sent a link to reset your password.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <TextField label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Sending…" : "Send reset link"}</button>
      <p className="text-sm"><Link href="/login" className="text-emerald-700 underline">Back to log in</Link></p>
    </form>
  );
}
