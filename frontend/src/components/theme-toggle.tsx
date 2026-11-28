"use client";

import { useSyncExternalStore } from "react";
import { getTheme, setTheme, type Theme } from "@/lib/theme";

// The theme lives on <html data-theme>, set before paint by the inline script in the root layout.
// Subscribing to that attribute keeps every toggle instance in sync without a context provider.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

// The server cannot know the visitor's theme, so it renders a neutral placeholder (null) instead of
// guessing and flashing the wrong icon.
const getServerSnapshot = (): Theme | null => null;

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme | null>(subscribe, getTheme, getServerSnapshot);
  const base =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-700 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-600";

  if (theme === null) return <span className={base} aria-hidden="true" />;

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Light theme" : "Dark theme"}
      className={base}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
