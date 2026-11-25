import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState, ErrorNotice, ProductGridSkeleton } from "@/components/feedback";
import { Pagination } from "@/components/pagination";
import { ProductGrid } from "@/components/product-card";
import { attempt, cleanSearch, getProducts, parsePage } from "@/features/catalog/queries";

export const metadata: Metadata = { title: "Search" };

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const sp = await searchParams;
  const q = cleanSearch(sp.q);
  if (!q) return <EmptyState title="Search for groceries" hint="Try “milk”, “bananas” or “chips”." />;

  const result = await attempt(() => getProducts({ q, page: parsePage(sp.page) }));
  if (!result) return <ErrorNotice />;
  const { items, meta } = result;

  return (
    <>
      <h1 className="mb-4 text-xl font-bold">
        {meta.total} {meta.total === 1 ? "result" : "results"} for “{q}”
      </h1>
      {items.length === 0 ? (
        <EmptyState title="No products found" hint="Check the spelling or try a more general word." />
      ) : (
        <>
          <ProductGrid products={items} />
          <Pagination meta={meta} basePath={`/search?q=${encodeURIComponent(q)}`} />
        </>
      )}
    </>
  );
}
export default function SearchPage(props: PageProps<"/search">) {
  return (
    <Suspense fallback={<ProductGridSkeleton />}>
      <Results searchParams={props.searchParams} />
    </Suspense>
  );
}

