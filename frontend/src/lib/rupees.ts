/**
 * Rupee text <-> integer paise using string/integer math only (no floating point money).
 * "68" -> 6800, "68.5" -> 6850, "68.50" -> 6850, "0.05" -> 5. Anything else -> null.
 */
export function parseRupeesToPaise(input: string): number | null {
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const rupees = Number(m[1]);
  const paise = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  return rupees * 100 + paise;
}

/** 6800 -> "68", 6850 -> "68.50", 5 -> "0.05" (for pre-filling inputs). */
export function paiseToRupeesInput(paise: number): string {
  const rupees = Math.trunc(paise / 100);
  const frac = paise % 100;
  return frac === 0 ? String(rupees) : `${rupees}.${String(frac).padStart(2, "0")}`;
}
