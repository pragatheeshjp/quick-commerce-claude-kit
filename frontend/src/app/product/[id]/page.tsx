import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ErrorNotice } from "@/components/feedback";
import { AddToCart } from "@/features/cart/add-to-cart";
import { getProduct } from "@/features/catalog/queries";
import { discountPercent, formatPaise } from "@/lib/money";
import type { Product } from "@/types/api";

async function Detail({ params }: { params: PageProps<"/product/[id]">["params"] }) {
  const { id } = await params;
  let product: Product | null;
  try {
    product = await getProduct(id);
  } catch {
    return <ErrorNotice />;
  }
  if (!product) notFound();

  const off = discountPercent(product.price_paise, product.mrp_paise);
  return (
    <article className="grid gap-8 md:grid-cols-2">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-emerald-50">
        {product.image_url ? (
          <Image src={product.image_url} alt={product.name} fill priority sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-full items-center justify-center text-9xl font-bold text-emerald-300">
            {product.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <div>
        <p className="text-sm text-zinc-500">{product.brand ?? "Swiftcart"}</p>
        <h1 className="mt-1 text-2xl font-bold">{product.name}</h1>
        <p className="mt-1 text-zinc-600">{product.unit_label}</p>
        <p className="mt-4 flex items-baseline gap-3">
          <span className="text-3xl font-extrabold">{formatPaise(product.price_paise)}</span>
          {product.mrp_paise > product.price_paise && (
            <>
              <s className="text-zinc-500"><span className="sr-only">MRP </span>{formatPaise(product.mrp_paise)}</s>
              {off > 0 && <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-sm font-semibold text-emerald-800">{off}% off</span>}
            </>
          )}
        </p>
        <p className={`mt-3 font-medium ${product.in_stock ? "text-emerald-700" : "text-red-700"}`}>
          {product.in_stock ? "In stock" : "Currently out of stock"}
        </p>
        {product.description && <p className="mt-6 whitespace-pre-line text-zinc-700">{product.description}</p>}
        <div className="mt-6">
          <AddToCart productId={product.id} productName={product.name} inStock={product.in_stock} size="page" />
        </div>
        <Link href="/" className="mt-6 inline-block text-sm font-medium text-emerald-700 underline">← Keep shopping</Link>
      </div>
    </article>
  );
}

export default function ProductPage(props: PageProps<"/product/[id]">) {
  return (
    <Suspense fallback={<div aria-hidden="true" className="h-96 animate-pulse rounded-3xl bg-zinc-200/70" />}>
      <Detail params={props.params} />
    </Suspense>
  );
}
