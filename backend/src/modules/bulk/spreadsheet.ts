import ExcelJS from 'exceljs';
import { unzipSync } from 'fflate';

export interface Table {
  headers: string[];
  rows: string[][];
}

/** RFC 4180 CSV with BOM handling and delimiter sniffing (comma, semicolon or tab). */
export function parseCsv(input: string): Table {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.search(/\r?\n|$/));
  const delimiter = [',', ';', '\t'].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  const out: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      out.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    out.push(row);
  }
  const [headers = [], ...rows] = out;
  return { headers: headers.map((h) => h.trim()), rows };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Excel dates are stored as UTC midnight.
    const d = String(value.getUTCDate()).padStart(2, '0');
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    return `${d}-${m}-${value.getUTCFullYear()}`;
  }
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('error' in value) return '';
    return '';
  }
  return String(value);
}

export async function parseXlsx(buffer: Buffer): Promise<Table> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets.find((s) => s.actualRowCount > 0);
  if (!sheet) return { headers: [], rows: [] };
  const all: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as ExcelJS.CellValue[];
    // row.values is 1-based.
    all.push(values.slice(1).map((v) => cellText(v).trim()));
  });
  const [headers = [], ...rows] = all;
  return { headers, rows };
}

export async function parseTable(buffer: Buffer, fileName: string): Promise<Table> {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'xlsx') return parseXlsx(buffer);
  if (ext === 'csv' || ext === 'txt') return parseCsv(buffer.toString('utf8'));
  if (ext === 'xls') throw new Error('Old .xls files are not supported. In Excel choose File → Save As → .xlsx or .csv.');
  throw new Error('Upload the list as .xlsx or .csv');
}

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

export interface PhotoIndex {
  /** Lower-cased file name without folders, e.g. "1023.jpg". */
  byName: Map<string, string>;
  /** Lower-cased name without extension, e.g. "1023". */
  byStem: Map<string, string>;
  files: Record<string, Uint8Array>;
  skipped: string[];
}

/** Reads every image in a photos ZIP (folders allowed; macOS metadata ignored). */
export function readPhotosZip(buffer: Buffer): PhotoIndex {
  const files = unzipSync(new Uint8Array(buffer), {
    filter: (f) => !f.name.endsWith('/') && !f.name.includes('__MACOSX') && !/(^|\/)\./.test(f.name),
  });
  const index: PhotoIndex = { byName: new Map(), byStem: new Map(), files: {}, skipped: [] };
  for (const [path, data] of Object.entries(files)) {
    const base = path.split('/').pop()!;
    if (!IMAGE_EXT.test(base)) {
      index.skipped.push(base);
      continue;
    }
    index.files[path] = data;
    const lower = base.toLowerCase();
    index.byName.set(lower, path);
    index.byStem.set(lower.replace(IMAGE_EXT, '').trim(), path);
  }
  return index;
}

/** Finds the photo for a row: explicit file name first, then the roll no. / employee id. */
export function findPhoto(index: PhotoIndex, candidates: (string | undefined)[]) {
  for (const raw of candidates) {
    const key = raw?.trim().toLowerCase();
    if (!key) continue;
    const hit = index.byName.get(key) ?? index.byStem.get(key.replace(IMAGE_EXT, ''));
    if (hit) return hit;
  }
  return undefined;
}
