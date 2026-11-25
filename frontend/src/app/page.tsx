import Link from "next/link";
import { Suspense } from "react";
import { EmptyState, ErrorNotice, ProductGridSkeleton } from "@/components/feedback";
import { ProductGrid } from "@/components/product-card";
import { attempt, getCategories, getProducts } from "@/features/catalog/queries";

async function CategoryStrip() {
  const all = await attempt(getCategories);
  if (!all) return <ErrorNotice />;
  const categories = all.filter((c) => c.parent_id === null);
  if (categories.length === 0) return null;
  return (
    <nav aria-label="Shop by category">
      <ul className="flex gap-3 overflow-x-auto pb-2">
        {categories.map((c) => (
          <li key={c.id} className="shrink-0">
            <Link
              href={`/category/${c.slug}`}
              className="flex h-24 w-28 flex-col items-center justify-center gap-1 rounded-2xl border border-zinc-200 bg-white px-2 text-center text-sm font-medium shadow-sm hover:border-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-600"
            >
              <span aria-hidden="true" className="text-2xl font-bold text-emerald-500">{c.name.charAt(0)}</span>
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

async function FreshPicks() {
  const result = await attempt(() => getProducts({ page: 1 }));
  if (!result) return <ErrorNotice />;
  if (result.items.length === 0) {
    return <EmptyState title="Our shelves are being stocked" hint="Check back in a little while." />;
  }
  return <ProductGrid products={result.items.slice(0, 10)} />;
}
export default function HomePage() {
  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-emerald-700 px-6 py-10 text-white sm:px-10">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Groceries in minutes.</h1>
        <p className="mt-2 max-w-md text-emerald-50">
          Fresh produce, dairy and daily essentials, delivered to your door. Pick your pincode to get started.
        </p>
      </section>

      <Suspense fallback={<div aria-hidden="true" className="h-24 animate-pulse rounded-2xl bg-zinc-200/70" />}>
        <CategoryStrip />
      </Suspense>

      <section aria-labelledby="fresh-heading">
        <h2 id="fresh-heading" className="mb-4 text-xl font-bold">Fresh picks</h2>
        <Suspense fallback={<ProductGridSkeleton count={5} />}>
          <FreshPicks />
        </Suspense>
      </section>
    </div>
  );
}

