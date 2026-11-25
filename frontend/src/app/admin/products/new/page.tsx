import type { Metadata } from "next";
import { ProductForm } from "@/features/admin/product-form";

export const metadata: Metadata = { title: "New product" };

// Admin pages sit behind a client-side session/role gate (see AdminLayout), so they are intentionally not part of the
// static shell. Opt out of dev-time instant-navigation validation (warning level only; build unaffected).
export const instant = false;

export default function NewProductPage() {
  return (
    <div className="max-w-2xl">
      <h2 className="mb-4 text-xl font-bold">New product</h2>
      <ProductForm />
    </div>
  );
}

