import type { Response } from 'express';

export interface Column<T> {
  key: string;
  label: string;
  value: (row: T) => string | number | null | undefined;
}

function cell(v: unknown) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Neutralise spreadsheet formulas (CSV injection) and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv<T>(rows: T[], columns: Column<T>[]) {
  const lines = [columns.map((c) => cell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(c.value(row))).join(','));
  return lines.join('\r\n');
}

/** UTF-8 BOM so Excel opens Hindi names correctly. */
export function sendCsv<T>(res: Response, fileName: string, rows: T[], columns: Column<T>[]) {
  res
    .type('text/csv; charset=utf-8')
    .setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    .send(`﻿${toCsv(rows, columns)}`);
}
