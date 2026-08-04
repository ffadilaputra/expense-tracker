import { formatIDR } from '../../utils/money';
import { clip, paginate, rgb, rowsPerPage } from './pdfLayout';
import type { BreakdownSegment } from '../transactions/categoryBreakdown';
import type { ReportData } from './reportData';

/** Every string the document needs, already translated by the caller. */
export interface PdfStrings {
  appTitle: string;
  periodLabel: string;
  generatedOn: string;
  income: string;
  expense: string;
  net: string;
  trendTitle: string;
  byCategory: string;
  transactions: string;
  colDate: string;
  colCategory: string;
  colNote: string;
  colAccount: string;
  colAmount: string;
  colShare: string;
  pageOf: (page: number, total: number) => string;
}

/** Hex strings read off the document root, so the PDF matches the app's theme. */
export interface PdfPalette {
  /** --cat-0 .. --cat-5 */
  categories: string[];
  /** --cat-other */
  other: string;
  income: string;
  expense: string;
}

export interface ExportOptions {
  data: ReportData;
  strings: PdfStrings;
  palette: PdfPalette;
  categoryName: (category: string) => string;
  accountLabels: Map<string, string>;
  filename: string;
}

// A4 portrait in millimetres.
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 14;
const CONTENT_W = PAGE_W - MARGIN * 2;
const ROW_H = 6;
const FOOTER_H = 12;

// Ink is fixed to the light-theme values whatever theme the app is in. Paper is
// white; a dark-theme document would print as a black rectangle.
const INK: [number, number, number] = [17, 17, 17];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [220, 222, 224];

type Doc = import('jspdf').jsPDF;

function colourOf(segment: BreakdownSegment, palette: PdfPalette): string {
  return segment.slot < 0 ? palette.other : (palette.categories[segment.slot] ?? palette.other);
}

/**
 * A ring segment is a polyline sampled along the arc, stroked with the line
 * width set to the ring thickness. jsPDF has no arc primitive, and this needs
 * no bezier approximation - at two degrees per step it is indistinguishable
 * from a true arc, and it stays vector.
 */
function drawRing(
  doc: Doc,
  cx: number,
  cy: number,
  radius: number,
  thickness: number,
  segments: BreakdownSegment[],
  palette: PdfPalette
): void {
  doc.setLineWidth(thickness);
  let start = -Math.PI / 2; // twelve o'clock, matching the on-screen ring

  for (const segment of segments) {
    const sweep = segment.fraction * Math.PI * 2;
    const steps = Math.max(2, Math.ceil((sweep * 180) / Math.PI / 2));
    doc.setDrawColor(...rgb(colourOf(segment, palette)));

    let px = cx + radius * Math.cos(start);
    let py = cy + radius * Math.sin(start);
    for (let i = 1; i <= steps; i++) {
      const angle = start + (sweep * i) / steps;
      const x = cx + radius * Math.cos(angle);
      const y = cy + radius * Math.sin(angle);
      doc.line(px, py, x, y);
      px = x;
      py = y;
    }
    start += sweep;
  }

  doc.setLineWidth(0.2);
}

function drawTrend(
  doc: Doc,
  data: ReportData,
  palette: PdfPalette,
  top: number,
  height: number
): void {
  const { buckets } = data;
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.income, b.expense)));
  const slot = CONTENT_W / buckets.length;
  const bar = Math.min(2.2, slot / 2 - 0.3);
  const baseline = top + height;

  buckets.forEach((bucket, i) => {
    const centre = MARGIN + i * slot + slot / 2;
    const incomeH = (bucket.income / max) * height;
    const expenseH = (bucket.expense / max) * height;

    doc.setFillColor(...rgb(palette.income));
    doc.rect(centre - bar - 0.2, baseline - incomeH, bar, incomeH, 'F');
    doc.setFillColor(...rgb(palette.expense));
    doc.rect(centre + 0.2, baseline - expenseH, bar, expenseH, 'F');
  });

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, baseline, MARGIN + CONTENT_W, baseline);

  // Twelve month labels fit; thirty-one day numbers do not.
  const step = buckets.length > 12 ? 5 : 1;
  doc.setFontSize(6);
  doc.setTextColor(...MUTED);
  buckets.forEach((bucket, i) => {
    if (i % step !== 0) return;
    doc.text(bucket.label, MARGIN + i * slot + slot / 2, baseline + 3.5, { align: 'center' });
  });
}

/** Draws the page-1 summary block and returns the y it ended at. */
function drawSummary(doc: Doc, opts: ExportOptions): number {
  const { data, strings, palette } = opts;
  let y = MARGIN + 6;

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(strings.appTitle, MARGIN, y);

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(strings.periodLabel, MARGIN, y);

  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(strings.generatedOn, MARGIN, y);

  // Totals, three even columns.
  y += 10;
  const column = CONTENT_W / 3;
  const cells: [string, number, [number, number, number]][] = [
    [strings.income, data.totals.income, rgb(palette.income)],
    [strings.expense, data.totals.expense, rgb(palette.expense)],
    [strings.net, data.totals.net, data.totals.net < 0 ? rgb(palette.expense) : INK]
  ];
  cells.forEach(([label, value, colour], i) => {
    const x = MARGIN + i * column;
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.text(label, x, y);
    doc.setFontSize(12);
    doc.setTextColor(...colour);
    doc.setFont('helvetica', 'bold');
    doc.text(formatIDR(value), x, y + 6);
  });
  y += 12;

  if (data.buckets.length > 0) {
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(strings.trendTitle, MARGIN, y);
    y += 4;
    drawTrend(doc, data, palette, y, 30);
    y += 30 + 6;
  }

  const segments = data.breakdown.segments;
  if (segments.length > 0) {
    y += 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(strings.byCategory, MARGIN, y);
    y += 5;

    // The ring sits left, the table to its right, so the two read as one block.
    const ringTop = y;
    drawRing(doc, MARGIN + 20, ringTop + 20, 15, 7, segments, palette);

    const tableX = MARGIN + 46;
    const amountX = MARGIN + CONTENT_W - 24;
    const shareX = MARGIN + CONTENT_W;
    let rowY = ringTop + 4;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(strings.colCategory, tableX, rowY);
    doc.text(strings.colAmount, amountX, rowY, { align: 'right' });
    doc.text(strings.colShare, shareX, rowY, { align: 'right' });
    rowY += 4;

    doc.setFontSize(9);
    for (const segment of segments) {
      doc.setFillColor(...rgb(colourOf(segment, palette)));
      doc.rect(tableX, rowY - 2.4, 2.4, 2.4, 'F');
      doc.setTextColor(...INK);
      doc.text(clip(opts.categoryName(segment.category), 28), tableX + 4, rowY);
      doc.text(formatIDR(segment.amount), amountX, rowY, { align: 'right' });
      doc.setTextColor(...MUTED);
      doc.text(`${Math.round(segment.fraction * 100)}%`, shareX, rowY, { align: 'right' });
      rowY += 5;
    }

    // The ring is 40mm tall; a one-segment table is shorter than that.
    y = Math.max(rowY, ringTop + 40);
  }

  return y;
}

function drawTableHeader(doc: Doc, strings: PdfStrings, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(strings.transactions, MARGIN, y);

  const headY = y + 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(strings.colDate, MARGIN, headY);
  doc.text(strings.colCategory, MARGIN + 24, headY);
  doc.text(strings.colNote, MARGIN + 62, headY);
  doc.text(strings.colAccount, MARGIN + 112, headY);
  doc.text(strings.colAmount, MARGIN + CONTENT_W, headY, { align: 'right' });

  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, headY + 1.5, MARGIN + CONTENT_W, headY + 1.5);

  return headY + 6;
}

function drawRows(doc: Doc, rows: ReportData['rows'], opts: ExportOptions, top: number): void {
  let y = top;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);

  for (const row of rows) {
    doc.setTextColor(...MUTED);
    doc.text(row.date, MARGIN, y);
    doc.setTextColor(...INK);
    doc.text(clip(row.category || '-', 22), MARGIN + 24, y);
    doc.text(clip(row.note ?? '', 28), MARGIN + 62, y);
    doc.text(clip(opts.accountLabels.get(row.accountId ?? '') ?? '', 18), MARGIN + 112, y);

    const signed = row.type === 'income' ? row.amount : -row.amount;
    doc.setTextColor(...rgb(row.type === 'income' ? opts.palette.income : opts.palette.expense));
    doc.text(formatIDR(signed), MARGIN + CONTENT_W, y, { align: 'right' });

    y += ROW_H;
  }
}

async function deliver(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: 'application/pdf' });

  // The share sheet is the path that works in an installed iOS PWA, where an
  // anchor download is unreliable.
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      // Dismissing the sheet is not a failure, and must not then trigger a
      // download the user did not ask for.
      if ((err as Error).name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportReportPdf(opts: ExportOptions): Promise<void> {
  // Dynamic so jsPDF is code-split out of the initial bundle - see the design
  // doc's offline note for why ReportScreen also warms this chunk on mount.
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const summaryEnd = drawSummary(doc, opts);

  const firstCapacity = rowsPerPage(PAGE_H - MARGIN - FOOTER_H - (summaryEnd + 14), ROW_H);
  const restCapacity = rowsPerPage(PAGE_H - MARGIN - FOOTER_H - (MARGIN + 18), ROW_H);
  const pages = paginate(opts.data.rows, firstCapacity, restCapacity);

  pages.forEach((rows, i) => {
    if (i > 0) doc.addPage();
    const heading = i === 0 ? summaryEnd + 8 : MARGIN + 6;
    drawRows(doc, rows, opts, drawTableHeader(doc, opts.strings, heading));
  });

  // Footers last, once the real page count is known.
  const total = doc.getNumberOfPages();
  for (let page = 1; page <= total; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(opts.strings.pageOf(page, total), PAGE_W / 2, PAGE_H - 8, { align: 'center' });
  }

  await deliver(doc.output('blob'), opts.filename);
}
