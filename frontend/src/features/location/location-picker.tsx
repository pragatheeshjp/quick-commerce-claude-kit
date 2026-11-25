"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useLocation } from "@/features/location/location-provider";
import { formatPaise } from "@/lib/money";

export function LocationPicker() {
  const { pincode, info, status, choose, clear } = useLocation();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const result = await choose(value);
    if (result.error) return setError(result.error);
    setValue("");
    // Close on success; stay open for an unserviceable area so the explanation remains visible.
    if (result.info?.serviceable) setOpen(false);
  }

  const serviceable = info?.serviceable === true;
  const label = !pincode
    ? "Select location"
    : serviceable
      ? `Delivering to ${pincode}`
      : `${pincode} (not serviceable)`;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((o) => !o);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="flex max-w-44 items-center gap-1.5 truncate rounded-lg px-2 py-1.5 text-left text-sm font-medium text-zinc-900 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-600"
      >
        <span aria-hidden="true">📍</span>
        <span className="truncate">{label}</span>
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Choose delivery location"
          className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg"
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        >
          <form onSubmit={onSubmit} noValidate>
            <label htmlFor={`${panelId}-pin`} className="mb-1 block text-sm font-medium">Delivery pincode</label>
            <div className="flex gap-2">
              <input
                id={`${panelId}-pin`}
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="560001"
                aria-invalid={error ? true : undefined}
                aria-describedby={`${panelId}-msg`}
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 focus:outline-2 focus:outline-emerald-600"
              />
              <button
                type="submit"
                disabled={status === "checking"}
                className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              >
                {status === "checking" ? "Checking…" : "Check"}
              </button>
            </div>
            <p id={`${panelId}-msg`} role="alert" className="mt-2 min-h-5 text-sm text-red-700">{error}</p>
          </form>

          {info?.serviceable && (
            <p className="mt-1 text-sm text-emerald-800">
              We deliver to {info.area_name}, {info.city}. Delivery {formatPaise(info.delivery_fee_paise)} ·
              minimum order {formatPaise(info.min_order_paise)}.
            </p>
          )}
          {info && !info.serviceable && (
            <p className="mt-1 text-sm text-amber-800">Sorry, we do not deliver to {info.pincode} yet.</p>
          )}
          {pincode && (
            <button type="button" onClick={clear} className="mt-3 text-sm text-zinc-600 underline">
              Clear location
            </button>
          )}
        </div>
      )}
    </div>
  );
}

