// Single source of truth for turning a stored integer amount (Indonesian
// Rupiah, no decimal subunit) into display text and back. Everything that
// shows or reads a money value goes through here so grouping and the "Rp"
// prefix never drift between the form, the list, and the summary.

const GROUPER = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

/** `1250000` → `"Rp 1.250.000"`. Negatives read as `-Rp 1.000`. */
export function formatIDR(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded < 0 ? '-' : '';
  return `${sign}Rp ${GROUPER.format(Math.abs(rounded))}`;
}

/**
 * `"Rp 1.250.000"` / `"1.250.000"` → `1250000`. Keeps only digits, so any
 * prefix, spaces, or grouping separators the user (or the formatter) added
 * are ignored. Empty or non-numeric input is a valid "nothing entered yet"
 * state, so it returns 0 rather than NaN.
 */
export function parseAmount(input: string): number {
  const digits = input.replace(/\D/g, '');
  if (digits === '') return 0;
  const value = Number.parseInt(digits, 10);
  return Number.isNaN(value) ? 0 : value;
}
