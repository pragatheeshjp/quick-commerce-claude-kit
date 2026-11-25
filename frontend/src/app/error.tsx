"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="py-16 text-center">
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 text-zinc-600">An unexpected error occurred. Please try again.</p>
      <button onClick={reset} className="mt-6 rounded-xl bg-emerald-700 px-5 py-2.5 font-semibold text-white hover:bg-emerald-800">
        Try again
      </button>
    </div>
  );
}
