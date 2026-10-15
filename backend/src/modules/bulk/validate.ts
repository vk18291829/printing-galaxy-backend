import sharp from 'sharp';
import { KIND_SPECS, matchHeader, type CardKind, type FieldKey } from './card-kinds';
import { findPhoto, type PhotoIndex, type Table } from './spreadsheet';

export const MAX_ROWS = 5000;
/** Below this the face prints visibly soft on a 22 × 27 mm photo box (≈ 250 DPI). */
const MIN_GOOD = { w: 220, h: 270 };
/** Below this the photo is unusable. */
const MIN_USABLE = { w: 100, h: 120 };
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export interface Issue {
  row?: number;
  field?: string;
  message: string;
}

export interface ValidationResult {
  report: {
    rows: number;
    validRows: number;
    photosInZip: number;
    photosMatched: number;
    columns: string[];
    ignoredColumns: string[];
    errors: Issue[];
    warnings: Issue[];
  };
  records: { row: number; data: Record<string, string>; photo?: string }[];
}

const NON_LATIN = /[^\x20-\x7E\xA0-\xFF]/;
const REPORT_LIMIT = 500;

const cap = (list: Issue[]) =>
  list.length <= REPORT_LIMIT
    ? list
    : [...list.slice(0, REPORT_LIMIT - 1), { message: `…and ${list.length - REPORT_LIMIT + 1} more` }];

/**
 * Checks a parsed class list (and optional photos ZIP) against the card type. Row numbers in
 * messages match what the institution sees in Excel (header = row 1).
 */
export async function validateTable(kind: CardKind, table: Table, photos: PhotoIndex | null): Promise<ValidationResult> {
  const spec = KIND_SPECS[kind];
  const errors: Issue[] = [];
  const warnings: Issue[] = [];

  const columnMap = new Map<number, FieldKey>();
  const ignoredColumns: string[] = [];
  table.headers.forEach((h, i) => {
    const key = matchHeader(h);
    if (key && ![...columnMap.values()].includes(key)) columnMap.set(i, key);
    else if (h) ignoredColumns.push(h);
  });
  const columns = [...columnMap.values()];

  for (const field of spec.required) {
    if (!columns.includes(field)) {
      errors.push({ field, message: `Column "${field}" is missing. Add a column with this heading.` });
    }
  }
  if (ignoredColumns.length) {
    warnings.push({ message: `These columns were not recognised and will not be printed: ${ignoredColumns.join(', ')}` });
  }

  const rows = table.rows
    .map((cells, i) => ({ row: i + 2, cells }))
    .filter(({ cells }) => cells.some((c) => c?.trim()));
  if (rows.length === 0) errors.push({ message: 'The file has no rows below the heading row.' });
  if (rows.length > MAX_ROWS) errors.push({ message: `At most ${MAX_ROWS} rows per upload. Split the list into smaller files.` });
  if (!photos && spec.photoRequired) {
    errors.push({ field: 'photo', message: 'Upload a ZIP with one photo per person, named by roll no. (e.g. 1023.jpg).' });
  }
  if (photos?.skipped.length) {
    warnings.push({ message: `Skipped ${photos.skipped.length} non-image file(s) in the ZIP (only JPG, PNG, WEBP).` });
  }

  const seenIds = new Map<string, number>();
  const usedPhotos = new Set<string>();
  const records: ValidationResult['records'] = [];
  let validRows = 0;
  let photosMatched = 0;

  for (const { row, cells } of rows.slice(0, MAX_ROWS)) {
    const data: Record<string, string> = {};
    for (const [i, key] of columnMap) {
      const v = cells[i]?.replace(/\s+/g, ' ').trim();
      if (v) data[key] = v;
    }
    const before = errors.length;

    for (const field of spec.required) {
      if (columns.includes(field) && !data[field]) errors.push({ row, field, message: `${field} is empty` });
    }

    const id = data[spec.idField]?.toLowerCase();
    if (id) {
      const first = seenIds.get(id);
      if (first) errors.push({ row, field: spec.idField, message: `Duplicate ${spec.idField} "${data[spec.idField]}" (also on row ${first})` });
      else seenIds.set(id, row);
    }

    if (data.phone && !/^(\+?91[\s-]?)?[6-9]\d{9}$/.test(data.phone.replace(/[\s-]/g, ''))) {
      warnings.push({ row, field: 'phone', message: `Phone "${data.phone}" does not look like a 10-digit mobile number` });
    }
    if (data.bloodGroup && !/^(A|B|AB|O)\s*[+-]?(ve)?$/i.test(data.bloodGroup.replace(/\s/g, ''))) {
      warnings.push({ row, field: 'bloodGroup', message: `Blood group "${data.bloodGroup}" looks unusual` });
    }
    if (data.name && data.name.length > 32) {
      warnings.push({ row, field: 'name', message: 'Long name will be printed in a smaller font' });
    }
    if (Object.values(data).some((v) => NON_LATIN.test(v))) {
      warnings.push({ row, message: 'Contains Hindi or other non-English text, which staff will set by hand before printing' });
    }

    let photo: string | undefined;
    if (photos) {
      photo = findPhoto(photos, [data.photo, data[spec.idField], data.admissionNo, data.rollNo, data.employeeId]);
      if (!photo) {
        const hint = data.photo ? `"${data.photo}"` : `${data[spec.idField] ?? '(no id)'}.jpg`;
        (spec.photoRequired ? errors : warnings).push({ row, field: 'photo', message: `Photo ${hint} not found in the ZIP` });
      } else if (usedPhotos.has(photo)) {
        errors.push({ row, field: 'photo', message: `Photo ${photo.split('/').pop()} is used by more than one row` });
      } else {
        usedPhotos.add(photo);
        const bytes = photos.files[photo]!;
        if (bytes.byteLength > MAX_PHOTO_BYTES) {
          errors.push({ row, field: 'photo', message: `Photo ${photo.split('/').pop()} is larger than 15 MB` });
        } else {
          try {
            const meta = await sharp(bytes).metadata();
            // EXIF orientations 5–8 are rotated by 90°.
            const rotated = (meta.orientation ?? 1) >= 5;
            const w = (rotated ? meta.height : meta.width) ?? 0;
            const h = (rotated ? meta.width : meta.height) ?? 0;
            if (w < MIN_USABLE.w || h < MIN_USABLE.h) {
              errors.push({ row, field: 'photo', message: `Photo is too small (${w}×${h} px). Use at least ${MIN_GOOD.w}×${MIN_GOOD.h} px.` });
            } else if (w < MIN_GOOD.w || h < MIN_GOOD.h) {
              warnings.push({ row, field: 'photo', message: `Low-resolution photo (${w}×${h} px) may print blurry` });
            }
            if (w > h * 1.15) {
              warnings.push({ row, field: 'photo', message: 'Landscape photo: it will be cropped to the centre' });
            }
            photosMatched += 1;
          } catch {
            errors.push({ row, field: 'photo', message: `Photo ${photo.split('/').pop()} is damaged or not an image` });
          }
        }
      }
    }

    if (errors.length === before) validRows += 1;
    records.push({ row, data, photo });
  }

  if (photos) {
    const unused = Object.keys(photos.files).filter((p) => !usedPhotos.has(p));
    if (unused.length) {
      const names = unused.slice(0, 5).map((p) => p.split('/').pop()).join(', ');
      warnings.push({ message: `${unused.length} photo(s) in the ZIP match no row: ${names}${unused.length > 5 ? ', …' : ''}` });
    }
  }

  return {
    report: {
      rows: rows.length,
      validRows,
      photosInZip: photos ? Object.keys(photos.files).length : 0,
      photosMatched,
      columns,
      ignoredColumns,
      // Keep the stored report bounded for very messy files.
      errors: cap(errors),
      warnings: cap(warnings),
    },
    records,
  };
}
