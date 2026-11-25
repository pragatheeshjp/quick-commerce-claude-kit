import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EmptyState, ErrorNotice, ProductGridSkeleton } from "@/components/feedback";
import { Pagination } from "@/components/pagination";
import { ProductGrid } from "@/components/product-card";
import { getCategories, getProducts, parsePage } from "@/features/catalog/queries";
import type { Category, PageMeta, Product } from "@/types/api";

type Loaded = { category: Category | undefined; items: Product[]; meta: PageMeta } | null;

async function load(slug: string, page: number): Promise<Loaded> {
  try {
    const category = (await getCategories()).find((c) => c.slug === slug);
    if (!category) return { category: undefined, items: [], meta: { page, pageSize: 24, total: 0 } };
    const { items, meta } = await getProducts({ category: slug, page });
    return { category, items, meta };
  } catch {
    return null; // API unreachable: show an inline error instead of a 404
  }
}

async function Listing({ params, searchParams }: Pick<PageProps<"/category/[slug]">, "params" | "searchParams">) {
  const { slug } = await params;
  const sp = await searchParams;
  const loaded = await load(slug, parsePage(sp.page));

  if (!loaded) return <ErrorNotice />;
  if (!loaded.category) notFound();

  return (
    <>
      <h1 className="mb-4 text-xl font-bold">{loaded.category.name}</h1>
      {loaded.items.length === 0 ? (
        <EmptyState title="Nothing here yet" hint="We are adding products to this aisle soon." />
      ) : (
        <>
          <ProductGrid products={loaded.items} />
          <Pagination meta={loaded.meta} basePath={`/category/${encodeURIComponent(slug)}`} />
        </>
      )}
    </>
  );
}

export default function CategoryPage(props: PageProps<"/category/[slug]">) {
  return (
    <Suspense fallback={<ProductGridSkeleton />}>
      <Listing params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
