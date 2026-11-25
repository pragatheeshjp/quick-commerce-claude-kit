"use client";

import { useState, type FormEvent } from "react";
import { EmptyState, ErrorNotice } from "@/components/feedback";
import { primaryButton, TextField } from "@/components/text-field";
import { useApiData, useAuthedApi } from "@/features/auth/use-api";
import { describeApiError } from "@/lib/errors";
import { categoryFormSchema, fieldErrors } from "@/lib/validation";
import type { AdminCategory } from "@/types/api";

function CategoryForm({ category, parents, onDone, onCancel }: { category?: AdminCategory; parents: AdminCategory[]; onDone: () => void; onCancel?: () => void }) {
  const call = useAuthedApi();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    const form = e.currentTarget;
    const raw = Object.fromEntries(new FormData(form));
    const parsed = categoryFormSchema.safeParse({ ...raw, parent_id: raw.parent_id ?? "", is_active: raw.is_active === "on" });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      if (category) await call(`/admin/categories/${category.id}`, { method: "PATCH", body: parsed.data });
      else await call("/admin/categories", { method: "POST", body: parsed.data });
      if (!category) form.reset();
      onDone();
    } catch (err) {
      setFormError(describeApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-label={category ? `Edit ${category.name}` : "New category"} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
      <h3 className="font-bold">{category ? `Edit ${category.name}` : "New category"}</h3>
      <TextField label="Name" name="name" defaultValue={category?.name} error={errors.name} />
      <TextField label="Slug (used in the URL)" name="slug" defaultValue={category?.slug} error={errors.slug} />
      <div>
        <label htmlFor="parent_id" className="mb-1 block text-sm font-medium">Parent category (optional)</label>
        <select id="parent_id" name="parent_id" defaultValue={category?.parent_id ?? ""} className="w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5">
          <option value="">None (top level)</option>
          {parents.filter((p) => p.id !== category?.id && p.parent_id === null).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <TextField label="Sort order" name="sort_order" inputMode="numeric" defaultValue={String(category?.sort_order ?? 0)} error={errors.sort_order} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={category?.is_active ?? true} /> Visible to customers</label>
      {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className={primaryButton}>{busy ? "Saving…" : category ? "Save changes" : "Create category"}</button>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 font-semibold hover:bg-zinc-50">Cancel</button>}
      </div>
    </form>
  );
}

export function AdminCategories() {
  const { data, error, loading, reload } = useApiData<AdminCategory[]>("/admin/categories");
  const [editingId, setEditingId] = useState<string | null>(null);
  const categories = data ?? [];
  const editing = categories.find((c) => c.id === editingId);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-3">
        <h2 className="text-xl font-bold">Categories</h2>
        {loading && <p role="status" className="text-zinc-500">Loading categories…</p>}
        {error && <ErrorNotice message={error} />}
        {data && data.length === 0 && <EmptyState title="No categories yet" hint="Create one to start adding products." />}
        {data && data.length > 0 && (
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className={c.parent_id ? "pl-4" : ""}>
                  <p className="font-medium">{c.name} {!c.is_active && <span className="ml-1 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">Inactive</span>}</p>
                  <p className="text-xs text-zinc-500">/{c.slug} · order {c.sort_order}</p>
                </div>
                <button type="button" onClick={() => setEditingId(c.id)} className="text-sm text-emerald-700 underline">Edit{" "}<span className="sr-only">{c.name}</span></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        {editing ? (
          <CategoryForm key={editing.id} category={editing} parents={categories} onDone={() => { setEditingId(null); reload(); }} onCancel={() => setEditingId(null)} />
        ) : (
          <CategoryForm key="new" parents={categories} onDone={reload} />
        )}
      </div>
    </div>
  );
}

