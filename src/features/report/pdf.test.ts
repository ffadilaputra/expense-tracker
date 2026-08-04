import { describe, it, expect, vi, beforeAll } from 'vitest';
import { exportReportPdf, type ExportOptions } from './pdf';
import { buildReport } from './reportData';
import type { Transaction } from '../../types';

// A smoke test, not a golden-file test: it asserts that every drawing path runs
// and yields a real PDF. The document's appearance is checked by eye - what is
// worth automating is that a geometry or jsPDF-API mistake cannot ship silently.

let captured: Blob | null = null;

beforeAll(() => {
  // jsdom implements none of these, and deliver() needs all three. The object
  // URL stub doubles as the capture point for the blob under test.
  URL.createObjectURL = vi.fn((blob: Blob) => {
    captured = blob;
    return 'blob:stub';
  }) as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36).slice(2),
    type: 'expense', amount: 25_000, category: 'Food', date: '2026-07-05',
    createdAt: '2026-07-05T00:00:00.000Z', ...partial
  };
}

function options(txns: Transaction[], period: Parameters<typeof buildReport>[1]): ExportOptions {
  captured = null;

  return {
    data: buildReport(txns, period, 'en'),
    accountLabels: new Map([['a1', 'Wallet']]),
    categoryName: (c) => c,
    filename: 'test.pdf',
    palette: {
      categories: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'],
      other: '#9aa1a8',
      income: '#157f3b',
      expense: '#b23b3b'
    },
    strings: {
      appTitle: 'Oeank', periodLabel: 'July 2026', generatedOn: 'Generated 2026-08-04',
      income: 'Income', expense: 'Expense', net: 'Net',
      trendTitle: 'Income and expense', byCategory: 'By category',
      transactions: 'Transactions', colDate: 'Date', colCategory: 'Category',
      colNote: 'Note', colAccount: 'Account', colAmount: 'Amount', colShare: 'Share',
      pageOf: (page, total) => `Page ${page} of ${total}`
    }
  };
}

/** jsdom's Blob exposes only slice/size/type, so FileReader does the reading. */
function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

async function pdfBytes(opts: ExportOptions): Promise<Uint8Array> {
  await exportReportPdf(opts);
  expect(captured).not.toBeNull();
  const blob = captured as unknown as Blob;
  expect(blob.type).toBe('application/pdf');
  return readBlob(blob);
}

/** Every PDF begins with the five bytes '%PDF-'. */
function isPdf(bytes: Uint8Array): boolean {
  return String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
}

describe('exportReportPdf', () => {
  it('renders a month, with the trend chart, ring and tables', async () => {
    const txns = [
      tx({ date: '2026-07-01', category: 'Food', amount: 45_000, accountId: 'a1' }),
      tx({ date: '2026-07-14', category: 'Transport', amount: 12_000, note: 'bus' }),
      tx({ date: '2026-07-25', type: 'income', amount: 8_000_000, category: 'Salary' })
    ];
    const bytes = await pdfBytes(options(txns, { kind: 'month', key: '2026-07' }));
    expect(isPdf(bytes)).toBe(true);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('renders a year, whose chart has twelve buckets', async () => {
    const txns = [tx({ date: '2026-01-10' }), tx({ date: '2026-12-20' })];
    const opts = options(txns, { kind: 'year', year: '2026' });
    expect(opts.data.buckets).toHaveLength(12);
    expect(isPdf(await pdfBytes(opts))).toBe(true);
  });

  it('renders a single day, where there is no chart to draw', async () => {
    const txns = [tx({ date: '2026-07-05' })];
    const opts = options(txns, { kind: 'date', date: '2026-07-05' });
    expect(opts.data.buckets).toEqual([]);
    expect(isPdf(await pdfBytes(opts))).toBe(true);
  });

  it('renders an empty period without a ring or any rows', async () => {
    const opts = options([], { kind: 'month', key: '2026-07' });
    expect(opts.data.rows).toEqual([]);
    expect(isPdf(await pdfBytes(opts))).toBe(true);
  });

  it('paginates a period too large for one page', async () => {
    // 120 rows at 6mm cannot fit beneath the summary on a single A4 page.
    const txns = Array.from({ length: 120 }, (_, i) =>
      tx({ date: `2026-07-${String((i % 28) + 1).padStart(2, '0')}`, category: `Cat ${i % 9}` })
    );
    const opts = options(txns, { kind: 'month', key: '2026-07' });
    expect(opts.data.rows).toHaveLength(120);
    expect(isPdf(await pdfBytes(opts))).toBe(true);
  });

  it('survives a category list longer than the palette', async () => {
    const txns = Array.from({ length: 20 }, (_, i) =>
      tx({ date: '2026-07-05', category: `Category ${i}`, amount: (i + 1) * 1000 })
    );
    const opts = options(txns, { kind: 'month', key: '2026-07' });
    // buildBreakdown folds the tail into OTHER, so the ring never exceeds six.
    expect(opts.data.breakdown.segments.length).toBeLessThanOrEqual(6);
    expect(isPdf(await pdfBytes(opts))).toBe(true);
  });
});
