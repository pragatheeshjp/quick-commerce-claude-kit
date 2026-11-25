"use client";

import { useState, type FormEvent } from "react";
import { primaryButton, TextField } from "@/components/text-field";
import { useAuthedApi } from "@/features/auth/use-api";
import { describeApiError } from "@/lib/errors";
import { addressSchema, fieldErrors } from "@/lib/validation";
import type { Address } from "@/types/api";

export function AddressForm({ onSaved, onCancel }: { onSaved: (a: Address) => void; onCancel?: () => void }) {
  const call = useAuthedApi();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const raw = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = addressSchema.safeParse({ ...raw, is_default: raw.is_default === "on" });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      const res = await call<Address>("/addresses", { method: "POST", body: parsed.data });
      onSaved(res.data);
    } catch (err) {
      setFormError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4" aria-label="Add a new address">
      <TextField label="Label (e.g. Home, Work)" name="label" defaultValue="Home" error={errors.label} />
      <TextField label="House / flat and street" name="line1" autoComplete="address-line1" error={errors.line1} />
      <TextField label="Area, apartment (optional)" name="line2" autoComplete="address-line2" error={errors.line2} />
      <TextField label="Landmark (optional)" name="landmark" error={errors.landmark} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="City" name="city" autoComplete="address-level2" error={errors.city} />
        <TextField label="State" name="state" autoComplete="address-level1" error={errors.state} />
      </div>
      <TextField label="Pincode" name="pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" error={errors.pincode} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_default" /> Make this my default address</label>
      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Saving…" : "Save address"}</button>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 font-semibold hover:bg-zinc-50">Cancel</button>}
      </div>
    </form>
  );
}
