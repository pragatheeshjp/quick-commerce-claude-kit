"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { primaryButton, TextField } from "@/components/text-field";
import { fieldErrors, signupSchema } from "@/lib/validation";
import { useAuth } from "./auth-provider";
import { safeNextPath } from "./require-auth";

export function SignupForm() {
  const { signUp } = useAuth();
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmEmail, setConfirmEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const parsed = signupSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const result = await signUp(parsed.data.fullName, parsed.data.email, parsed.data.password);
    setBusy(false);
    if (result.error) return setFormError(result.error);
    if (result.needsConfirmation) return setConfirmEmail(true);
    router.replace(next);
  }

  if (confirmEmail) {
    return (
      <div role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">
        <p className="font-semibold">Check your email</p>
        <p className="mt-1 text-sm">
          We sent a confirmation link. Open it, then <Link href="/login" className="underline">log in</Link>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <TextField label="Full name" name="fullName" autoComplete="name" error={errors.fullName} />
      <TextField label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
      <TextField label="Password" name="password" type="password" autoComplete="new-password" error={errors.password} />
      <TextField label="Confirm password" name="confirmPassword" type="password" autoComplete="new-password" error={errors.confirmPassword} />
      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Creating account…" : "Create account"}</button>
      <p className="text-sm">Already have an account? <Link href="/login" className="text-emerald-700 underline">Log in</Link></p>
    </form>
  );
}
