import { describe, expect, it } from 'vitest';
import { matchHeader } from '@/modules/bulk/card-kinds';
import { sheetLayout } from '@/modules/bulk/card-renderer';
import { parseCsv } from '@/modules/bulk/spreadsheet';
import { numberToWordsIndian, rupeesInWords, winAnsi } from '@/modules/invoices/pdf-text';
import { quoteProduct } from '@/modules/pricing/pricing.service';
import { toCsv } from '@/modules/reports/csv';
import { addWorkingDays, generateOrderNumber } from '@/modules/orders/order.service';

const L = (en: string) => ({ en, hi: '' });
const notes = {
  unit: 'page',
  workflow: 'standard',
  options: [
    {
      key: 'binding',
      label: L('Binding'),
      required: true,
      values: [
        { value: 'none', label: L('None'), unitDelta: 0, fixedFee: 0, isDefault: true },
        { value: 'spiral', label: L('Spiral'), unitDelta: 0, fixedFee: 40, minCopies: 3, isDefault: false },
        { value: 'colour', label: L('Colour'), unitDelta: 4, fixedFee: 0, isDefault: false },
      ],
    },
  ],
  pricing: {
    retail: { enabled: true, minQty: 100, tiers: [{ minQty: 1, unitPrice: 1.5 }, { minQty: 300, unitPrice: 1.2 }] },
    institution: { enabled: true, minQty: 500, tiers: [{ minQty: 500, unitPrice: 1 }] },
  },
} as unknown as Parameters<typeof quoteProduct>[0];

describe('pricing engine', () => {
  it('prices pages × copies from the right tier', () => {
    const q = quoteProduct(notes, 'retail', { pageCount: 120, copies: 3 });
    expect(q.units).toBe(360);
    expect(q.unitPrice).toBe(1.2);
    expect(q.subtotal).toBe(432);
    expect(q.valid).toBe(true);
  });

  it('enforces the minimum and reports the next tier', () => {
    const q = quoteProduct(notes, 'retail', { pageCount: 50, copies: 1 });
    expect(q.valid).toBe(false);
    expect(q.errors[0]?.code).toBe('MIN_QTY');
    expect(quoteProduct(notes, 'retail', { pageCount: 150, copies: 1 }).nextTier).toEqual({ minQty: 300, unitPrice: 1.2 });
  });

  it('adds fixed fees per copy and enforces option minimum copies', () => {
    const tooFew = quoteProduct(notes, 'retail', { pageCount: 100, copies: 2, options: { binding: 'spiral' } });
    expect(tooFew.errors.map((e) => e.code)).toContain('MIN_COPIES');
    const ok = quoteProduct(notes, 'retail', { pageCount: 100, copies: 3, options: { binding: 'spiral' } });
    expect(ok.fixedFees).toBe(120);
    expect(ok.subtotal).toBe(300 * 1.2 + 120);
  });

  it('applies per-unit option deltas and the institution discount', () => {
    const q = quoteProduct(notes, 'institution', { pageCount: 500, copies: 1, options: { binding: 'colour' } }, 10);
    expect(q.unitPrice).toBe(5);
    expect(q.discount).toBe(250);
    expect(q.subtotal).toBe(2250);
  });
});

describe('invoice text helpers', () => {
  it('writes amounts in the Indian numbering system', () => {
    expect(numberToWordsIndian(12_34_567)).toBe('Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven');
    expect(numberToWordsIndian(1_00_00_000)).toBe('One Crore');
    expect(rupeesInWords(1325.5)).toBe('Rupees One Thousand Three Hundred Twenty Five and Fifty Paise Only');
  });

  it('strips characters standard PDF fonts cannot draw', () => {
    expect(winAnsi('₹ 12 × 18 — आरव Sharma')).toBe('Rs. 12 x 18 - Sharma');
  });
});

describe('spreadsheets', () => {
  it('parses quoted CSV with BOM, semicolons and CRLF', () => {
    const t = parseCsv('﻿Name;Roll No;Address\r\n"Sharma, Aarav";1023;"12 ""A"" Block"\r\nVerma;1024;\r\n');
    expect(t.headers).toEqual(['Name', 'Roll No', 'Address']);
    expect(t.rows[0]).toEqual(['Sharma, Aarav', '1023', '12 "A" Block']);
    expect(t.rows[1]).toEqual(['Verma', '1024', '']);
  });

  it('recognises common column headings', () => {
    expect(matchHeader('Roll No.')).toBe('rollNo');
    expect(matchHeader("Father's Name")).toBe('fatherName');
    expect(matchHeader('Emp Code')).toBe('employeeId');
    expect(matchHeader('Mobile No')).toBe('phone');
    expect(matchHeader('Favourite colour')).toBeNull();
  });

  it('escapes CSV output and neutralises formulas', () => {
    const csv = toCsv([{ a: '=SUM(A1)', b: 'x,"y"', c: -5 }], [
      { key: 'a', label: 'A', value: (r) => r.a },
      { key: 'b', label: 'B', value: (r) => r.b },
      { key: 'c', label: 'C', value: (r) => r.c },
    ]);
    expect(csv.split('\r\n')[1]).toBe(`'=SUM(A1),"x,""y""",-5`);
  });
});

describe('print sheet layout', () => {
  it('fits 9 ID cards (86 × 54 mm + 3 mm bleed) on an A4 sheet', () => {
    const layout = sheetLayout({ w: 86, h: 54 });
    expect(layout.perSheet).toBe(9);
    expect(layout.cw).toBe(92);
    expect(layout.ch).toBe(60);
    // Everything stays inside the sheet with a printable margin.
    expect(layout.originX).toBeGreaterThanOrEqual(5);
    expect(layout.originY).toBeGreaterThanOrEqual(5);
  });
});

describe('shop dates use Indian time, whatever the server clock', () => {
  it('dates the order number by the IST day', () => {
    // 00:30 on 29 Oct in India is still 28 Oct in UTC.
    expect(generateOrderNumber(new Date('2026-10-28T19:00:00Z'))).toMatch(/^PG261029-/);
  });

  it('skips Sundays as they fall in India', () => {
    // Saturday 31 Oct, 10:00 IST + 1 working day: Sunday is skipped, so Monday 2 Nov, same time.
    expect(addWorkingDays(new Date('2026-10-31T04:30:00Z'), 1).toISOString()).toBe('2026-11-02T04:30:00.000Z');
    // 01:30 on Sunday 1 Nov in India (still Saturday in UTC) + 1: Monday 2 Nov.
    expect(addWorkingDays(new Date('2026-10-31T20:00:00Z'), 1).toISOString()).toBe('2026-11-01T20:00:00.000Z');
  });
});
