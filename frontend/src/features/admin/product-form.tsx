"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ErrorNotice } from "@/components/feedback";
import { primaryButton, TextField } from "@/components/text-field";
import { useApiData, useAuthedApi } from "@/features/auth/use-api";
import { ApiError } from "@/lib/api";
import { describeApiError } from "@/lib/errors";
import { paiseToRupeesInput } from "@/lib/rupees";
import { fieldErrors, productFormSchema, stockSchema } from "@/lib/validation";
import type { AdminCategory, AdminProduct } from "@/types/api";

/** Add or subtract stock; every change is recorded in the inventory ledger by the API. */
export function StockAdjuster({ productId, current, onChanged }: { productId: string; current: number; onChanged: () => void }) {
  const call = useAuthedApi();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMessage(null);
    const form = e.currentTarget;
    const parsed = stockSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      const res = await call<{ stock_quantity: number }>(`/admin/products/${productId}/stock`, { method: "POST", body: parsed.data });
      setMessage(`Stock is now ${res.data.stock_quantity}.`);
      form.reset();
      onChanged();
    } catch (err) {
      setErrors({
        delta: err instanceof ApiError && err.code === "INSUFFICIENT_STOCK"
          ? "There is not enough stock to remove that many units."
          : describeApiError(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label="Adjust stock" className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
      <h3 className="font-bold">Stock: {current}</h3>
      <TextField label="Change (use a minus to remove)" name="delta" inputMode="numeric" placeholder="e.g. 20 or -3" error={errors.delta} />
      <div>
        <label htmlFor="stock-reason" className="mb-1 block text-sm font-medium">Reason</label>
        <select id="stock-reason" name="reason" defaultValue="restock" className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5">
          <option value="restock">Restock</option>
          <option value="adjustment">Adjustment (count correction, damage)</option>
        </select>
      </div>
      {message && <p role="status" className="text-sm text-emerald-800">{message}</p>}
      <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Saving…" : "Apply change"}</button>
    </form>
  );
}

/** Create (no `product`) or edit (with `product`). Prices are entered in rupees and sent as integer paise. */
export function ProductForm({ product }: { product?: AdminProduct }) {
  const call = useAuthedApi();
  const router = useRouter();
  const cats = useApiData<AdminCategory[]>("/admin/categories");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const editing = !!product;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setSaved(false);
    const raw = Object.fromEntries(new FormData(e.currentTarget));
    const parsed = productFormSchema.safeParse({ ...raw, is_active: raw.is_active === "on", initial_stock: raw.initial_stock ?? "" });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    const { price, mrp, initial_stock, ...rest } = parsed.data;
    const body = { ...rest, price_paise: price, mrp_paise: mrp, ...(editing ? {} : { initial_stock }) };
    setBusy(true);
    try {
      if (editing) {
        await call(`/admin/products/${product.id}`, { method: "PATCH", body });
        setSaved(true);
      } else {
        await call("/admin/products", { method: "POST", body });
        router.push("/admin/products");
      }
    } catch (err) {
      setFormError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (cats.error) return <ErrorNotice message={cats.error} />;

  return (
    <form onSubmit={onSubmit} noValidate aria-label={editing ? "Edit product" : "New product"} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
      <div>
        <label htmlFor="category_id" className="mb-1 block text-sm font-medium">Category</label>
        <select id="category_id" name="category_id" defaultValue={product?.category_id ?? ""} aria-invalid={errors.category_id ? true : undefined} aria-describedby={errors.category_id ? "category_id-error" : undefined} className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5">
          <option value="" disabled>Choose a category…</option>
          {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (inactive)"}</option>)}
        </select>
        {errors.category_id && <p id="category_id-error" role="alert" className="mt-1 text-sm text-red-700">{errors.category_id}</p>}
      </div>
      <TextField label="Name" name="name" defaultValue={product?.name} error={errors.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="SKU" name="sku" defaultValue={product?.sku} error={errors.sku} />
        <TextField label="Pack size (e.g. 500 g)" name="unit_label" defaultValue={product?.unit_label} error={errors.unit_label} />
      </div>
      <TextField label="Brand (optional)" name="brand" defaultValue={product?.brand ?? ""} error={errors.brand} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Selling price (₹)" name="price" inputMode="decimal" defaultValue={product ? paiseToRupeesInput(product.price_paise) : ""} error={errors.price} />
        <TextField label="MRP (₹)" name="mrp" inputMode="decimal" defaultValue={product ? paiseToRupeesInput(product.mrp_paise) : ""} error={errors.mrp} />
      </div>
      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-medium">Description (optional)</label>
        <textarea id="description" name="description" rows={4} defaultValue={product?.description ?? ""} className="w-full rounded-xl border border-zinc-300 px-3.5 py-2.5" />
        {errors.description && <p role="alert" className="mt-1 text-sm text-red-700">{errors.description}</p>}
      </div>
      {!editing && <TextField label="Opening stock" name="initial_stock" inputMode="numeric" defaultValue="0" error={errors.initial_stock} />}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={product?.is_active ?? true} /> Visible to customers</label>
      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
      {saved && <p role="status" className="text-sm text-emerald-800">Saved.</p>}
      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy} className={`${primaryButton} sm:w-auto sm:px-8`}>{busy ? "Saving…" : editing ? "Save changes" : "Create product"}</button>
        <Link href="/admin/products" className="text-sm underline">Back to products</Link>
      </div>
    </form>
  );
}

export function EditProduct({ id }: { id: string }) {
  const { data, error, loading, reload } = useApiData<AdminProduct>(`/admin/products/${encodeURIComponent(id)}`);
  if (loading) return <p role="status" className="text-zinc-500">Loading product…</p>;
  if (error || !data) return <ErrorNotice message={error ?? "Product not found."} />;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      {/* key remounts the form with fresh defaults after a reload */}
      <ProductForm key={`${data.id}-${data.price_paise}-${data.name}`} product={data} />
      <StockAdjuster productId={data.id} current={data.stock_quantity} onChanged={reload} />
    </div>
  );
}

