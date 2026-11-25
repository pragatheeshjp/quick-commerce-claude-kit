import Image from "next/image";
import Link from "next/link";
import { AddToCart } from "@/features/cart/add-to-cart";
import { discountPercent, formatPaise } from "@/lib/money";
import type { Product } from "@/types/api";

export function ProductCard({ product }: { product: Product }) {
  const off = discountPercent(product.price_paise, product.mrp_paise);
  return (
    <li className="relative flex flex-col rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm focus-within:ring-2 focus-within:ring-emerald-600">
      <div className="relative mb-3 aspect-square overflow-hidden rounded-xl bg-emerald-50">
        {product.image_url ? (
          <Image src={product.image_url} alt="" fill sizes="(min-width: 768px) 200px, 45vw" className="object-cover" />
        ) : (
          <span aria-hidden="true" className="flex h-full items-center justify-center text-5xl font-bold text-emerald-300">
            {product.name.charAt(0).toUpperCase()}
          </span>
        )}
        {off > 0 && product.in_stock && (
          <span className="absolute left-2 top-2 rounded-md bg-emerald-700 px-1.5 py-0.5 text-xs font-semibold text-white">
            {off}% OFF
          </span>
        )}
        {!product.in_stock && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-semibold text-zinc-700">
            Out of stock
          </span>
        )}
      </div>
      <h3 className="line-clamp-2 min-h-10 text-sm font-medium text-zinc-900">
        <Link href={`/product/${product.id}`} className="after:absolute after:inset-0 focus:outline-none">
          {product.name}
        </Link>
      </h3>
      <p className="text-xs text-zinc-500">{product.unit_label}</p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="font-semibold text-zinc-900">{formatPaise(product.price_paise)}</span>
        {product.mrp_paise > product.price_paise && (
          <s className="text-xs text-zinc-500">
            <span className="sr-only">MRP </span>
            {formatPaise(product.mrp_paise)}
          </s>
        )}
      </p>
      <div className="mt-3">
        <AddToCart productId={product.id} productName={product.name} inStock={product.in_stock} />
      </div>
    </li>
  );
}

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </ul>
  );
}

