/**
 * Formats integer paise as INR for display, using integer math only (no floating-point money).
 * 6800 -> "₹68", 4550 -> "₹45.50", 1234567 -> "₹12,345.67".
 */
export function formatPaise(paise: number): string {
  if (!Number.isInteger(paise)) throw new Error("Money must be an integer number of paise");
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.trunc(abs / 100);
  const fraction = abs % 100;
  const rupeeText = rupees.toLocaleString("en-IN");
  return fraction === 0
    ? `${sign}₹${rupeeText}`
    : `${sign}₹${rupeeText}.${String(fraction).padStart(2, "0")}`;
}

/** Whole-number percent saved versus MRP (0 when there is no saving). */
export function discountPercent(pricePaise: number, mrpPaise: number): number {
  if (mrpPaise <= 0 || pricePaise >= mrpPaise) return 0;
  return Math.floor(((mrpPaise - pricePaise) * 100) / mrpPaise);
}
