// Geometry and text arithmetic for the exported PDF, kept apart from pdf.ts so
// the parts worth testing can be tested without generating a document and
// reading its bytes back.

/** How many rows of `rowHeight` fit in `usableHeight`. Never negative. */
export function rowsPerPage(usableHeight: number, rowHeight: number): number {
  if (rowHeight <= 0) return 0;
  return Math.max(0, Math.floor(usableHeight / rowHeight));
}

/**
 * Splits rows across pages. The first page takes fewer, because the summary
 * block sits above the table there - that difference is the whole reason this
 * is a function rather than a slice loop inlined at the call site.
 */
export function paginate<T>(rows: T[], firstPageCapacity: number, pageCapacity: number): T[][] {
  if (rows.length === 0) return [];

  const pages: T[][] = [];
  // A capacity of zero for the continuation pages would never advance, so the
  // floor is one row per page: a cramped document still terminates.
  const rest = Math.max(1, pageCapacity);
  let taken = 0;

  if (firstPageCapacity > 0) {
    pages.push(rows.slice(0, firstPageCapacity));
    taken = firstPageCapacity;
  }
  while (taken < rows.length) {
    pages.push(rows.slice(taken, taken + rest));
    taken += rest;
  }

  return pages;
}

/**
 * '#2a78d6' -> [42, 120, 214]. The palette arrives as CSS custom property text
 * read off the document, and jsPDF wants numeric channels. Anything that does
 * not parse becomes black rather than throwing - a wrong colour is a far better
 * outcome than a failed export.
 */
export function rgb(hex: string): [number, number, number] {
  const raw = hex.trim().replace('#', '');
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [0, 0, 0];
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16)
  ];
}

/**
 * Clips text to a column width in characters. Notes are truncated rather than
 * wrapped so every table row stays exactly one line tall, which is what lets
 * the row arithmetic above be exact.
 *
 * The marker is three ASCII periods, not an ellipsis character: the document
 * uses jsPDF's built-in Helvetica with no embedded font, and staying inside
 * plain ASCII is what makes that safe.
 */
export function clip(text: string, max: number): string {
  if (max <= 0) return '';
  if (text.length <= max) return text;
  if (max <= 3) return text.slice(0, max);
  return `${text.slice(0, max - 3)}...`;
}
