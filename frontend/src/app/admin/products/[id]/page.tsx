import type { Metadata } from "next";
import { Suspense } from "react";
import { EditProduct } from "@/features/admin/product-form";

export const metadata: Metadata = { title: "Edit product" };

// Admin pages sit behind a client-side session/role gate (see AdminLayout), so they are intentionally not part of the
// static shell. Opt out of dev-time instant-navigation validation (warning level only; build unaffected).
export const instant = false;

async function Editor({ params }: { params: PageProps<"/admin/products/[id]">["params"] }) {
  const { id } = await params;
  return <EditProduct id={id} />;
}

export default function EditProductPage(props: PageProps<"/admin/products/[id]">) {
  return (
    <div>
      <h2 className="mb-4 text-xl font-bold">Edit product</h2>
      <Suspense fallback={<p role="status" className="text-zinc-500">Loading…</p>}>
        <Editor params={props.params} />
      </Suspense>
    </div>
  );
}

