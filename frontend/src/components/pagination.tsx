import Link from "next/link";
import type { PageMeta } from "@/types/api";

/** Prev/next links. `basePath` may already contain a query string (e.g. "/search?q=milk"). */
export function Pagination({ meta, basePath }: { meta: PageMeta; basePath: string }) {
  const pages = Math.max(1, Math.ceil(meta.total / meta.pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => `${basePath}${basePath.includes("?") ? "&" : "?"}page=${p}`;
  const link = "rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-emerald-600";
  return (
    <nav aria-label="Pagination" className="mt-8 flex items-center justify-between">
      {meta.page > 1 ? <Link href={href(meta.page - 1)} className={link} rel="prev">Previous</Link> : <span />}
      <span className="text-sm text-zinc-600">Page {meta.page} of {pages}</span>
      {meta.page < pages ? <Link href={href(meta.page + 1)} className={link} rel="next">Next</Link> : <span />}
    </nav>
  );
}
