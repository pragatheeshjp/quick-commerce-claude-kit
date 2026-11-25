import type { InputHTMLAttributes } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/** Labelled input with an inline, screen-reader-announced error. */
export function TextField({ label, error, id, ...rest }: Props) {
  const inputId = id ?? rest.name;
  const errorId = `${inputId}-error`;
  return (
    <div>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-zinc-800">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-base text-zinc-900 focus:outline-2 focus:outline-offset-1 focus:outline-emerald-600 ${
          error ? "border-red-500" : "border-zinc-300"
        }`}
        {...rest}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export const primaryButton =
  "inline-flex w-full items-center justify-center rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-60";
