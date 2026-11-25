"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { primaryButton, TextField } from "@/components/text-field";
import { fieldErrors, loginSchema } from "@/lib/validation";
import { useAuth } from "./auth-provider";
import { safeNextPath } from "./require-auth";

export function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const parsed = loginSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    const { error } = await signIn(parsed.data.email, parsed.data.password);
    setBusy(false);
    if (error) return setFormError(error);
    router.replace(next);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <TextField label="Email" name="email" type="email" autoComplete="email" error={errors.email} />
      <TextField label="Password" name="password" type="password" autoComplete="current-password" error={errors.password} />
      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Signing in…" : "Log in"}</button>
      <p className="flex justify-between text-sm">
        <Link href="/forgot-password" className="text-emerald-700 underline">Forgot password?</Link>
        <Link href={`/signup?next=${encodeURIComponent(next)}`} className="text-emerald-700 underline">Create account</Link>
      </p>
    </form>
  );
}
