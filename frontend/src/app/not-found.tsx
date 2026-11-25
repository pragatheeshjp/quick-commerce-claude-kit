import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">We could not find that page</h1>
      <p className="mt-2 text-zinc-600">It may have moved, or the item is no longer available.</p>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white hover:bg-emerald-800">
        Back to home
      </Link>
    </div>
  );
}
