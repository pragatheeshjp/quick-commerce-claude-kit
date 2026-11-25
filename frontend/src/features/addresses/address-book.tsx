"use client";

import { useEffect, useState } from "react";
import { EmptyState, ErrorNotice } from "@/components/feedback";
import { useApiData, useAuthedApi } from "@/features/auth/use-api";
import { describeApiError } from "@/lib/errors";
import type { Address } from "@/types/api";
import { AddressForm } from "./address-form";

export function addressLine(a: Address): string {
  return [a.line1, a.line2, a.landmark, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(", ");
}

interface Props {
  /** When provided, addresses render as a radio group and report the selection. */
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Reports the loaded list so the parent can choose a default. */
  onLoaded?: (addresses: Address[]) => void;
}

export function AddressBook({ selectedId, onSelect, onLoaded }: Props) {
  const call = useAuthedApi();
  const { data, error, loading, reload } = useApiData<Address[]>("/addresses");
  const [adding, setAdding] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const selectable = !!onSelect;

  // Report the list upward whenever it (re)loads.
  useEffect(() => {
    if (data) onLoaded?.(data);
  }, [data, onLoaded]);

  async function act(run: () => Promise<unknown>) {
    setActionError(null);
    try {
      await run();
      reload();
    } catch (err) {
      setActionError(describeApiError(err));
    }
  }

  if (loading) return <p role="status" className="text-zinc-500">Loading addresses…</p>;
  if (error) return <ErrorNotice message={error} />;
  const addresses = data ?? [];

  return (
    <div className="space-y-4">
      {addresses.length === 0 && !adding && <EmptyState title="No saved addresses" hint="Add where we should deliver." />}
      {actionError && <p role="alert" className="text-sm text-red-700">{actionError}</p>}

      <ul className="space-y-3" role={selectable ? "radiogroup" : undefined} aria-label={selectable ? "Delivery address" : undefined}>
        {addresses.map((a) => (
          <li key={a.id} className={`rounded-2xl border bg-white p-4 ${selectable && selectedId === a.id ? "border-emerald-600 ring-1 ring-emerald-600" : "border-zinc-200"}`}>
            <div className="flex items-start gap-3">
              {selectable && (
                <input type="radio" name="address" id={`addr-${a.id}`} checked={selectedId === a.id} onChange={() => onSelect?.(a.id)} className="mt-1.5 h-4 w-4 accent-emerald-600" />
              )}
              <div className="min-w-0 flex-1">
                <label htmlFor={selectable ? `addr-${a.id}` : undefined} className="font-semibold">
                  {a.label} {a.is_default && <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">Default</span>}
                </label>
                <p className="text-sm text-zinc-600">{addressLine(a)}</p>
                <div className="mt-2 flex gap-4 text-sm">
                  {!a.is_default && (
                    <button type="button" className="text-emerald-700 underline" onClick={() => act(() => call(`/addresses/${a.id}`, { method: "PATCH", body: { is_default: true } }))}>
                      Make default{" "}<span className="sr-only">{a.label}</span>
                    </button>
                  )}
                  <button type="button" className="text-zinc-600 underline hover:text-red-700" onClick={() => act(() => call(`/addresses/${a.id}`, { method: "DELETE" }))}>
                    Delete{" "}<span className="sr-only">{a.label}</span>
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {adding ? (
        <AddressForm
          onCancel={() => setAdding(false)}
          onSaved={(saved) => {
            setAdding(false);
            reload();
            onSelect?.(saved.id);
          }}
        />
      ) : (
        addresses.length < 10 && (
          <button type="button" onClick={() => setAdding(true)} className="rounded-xl border border-emerald-600 px-4 py-2 font-semibold text-emerald-700 hover:bg-emerald-50">
            + Add a new address
          </button>
        )
      )}
    </div>
  );
}


