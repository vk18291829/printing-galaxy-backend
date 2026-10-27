import ExcelJS from 'exceljs';
import { zipSync } from 'fflate';
import type { FilterQuery, Types } from 'mongoose';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { ApiError } from '@/common/errors';
import type { AuthContext } from '@/common/types';
import { logger } from '@/config/logger';
import { matchHeader } from '@/modules/bulk/card-kinds';
import { findPhoto, parseTable, readPhotosZip } from '@/modules/bulk/spreadsheet';
import { FileModel } from '@/modules/uploads/file.model';
import { presignDownload, putObject, readObject } from '@/modules/uploads/storage';
import { nextCodes, PersonModel, ROSTER_FIELDS, type Person, type PersonDoc, type PersonKind, type RosterField } from './roster.model';

export const MAX_IMPORT_ROWS = 3000;

/** Passport-style photo: 3:4, small enough for a card and a quick list. */
const PHOTO = { width: 600, height: 800 };

export const COLUMN_LABELS: Record<RosterField, string> = {
  name: 'Name',
  fatherName: "Father's Name",
  motherName: "Mother's Name",
  dob: 'Date of Birth',
  class: 'Class',
  section: 'Section',
  rollNo: 'Roll No',
  admissionNo: 'Admission No',
  bloodGroup: 'Blood Group',
  phone: 'Phone',
  address: 'Address',
  route: 'Bus Route',
  session: 'Session',
  employeeId: 'Employee ID',
  designation: 'Designation',
  department: 'Department',
};

/** Columns shown and exported for each kind of person. */
export const KIND_FIELDS: Record<PersonKind, RosterField[]> = {
  student: ['name', 'fatherName', 'motherName', 'dob', 'class', 'section', 'rollNo', 'admissionNo', 'bloodGroup', 'phone', 'address', 'route', 'session'],
  staff: ['name', 'employeeId', 'designation', 'department', 'fatherName', 'dob', 'bloodGroup', 'phone', 'address', 'session'],
};

/** Dates arrive as 2014-05-09 (date inputs) or 09-05-2014 / 09/05/2014 (sheets); keep DD-MM-YYYY. */
export function normaliseDob(value?: string) {
  if (!value) return value;
  const v = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const dmy = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v);
  if (dmy) return `${dmy[1]!.padStart(2, '0')}-${dmy[2]!.padStart(2, '0')}-${dmy[3]}`;
  return v;
}

export function cleanFields(input: Partial<Record<RosterField, string | undefined>>) {
  const out: Partial<Record<RosterField, string>> = {};
  for (const f of ROSTER_FIELDS) {
    const v = input[f];
    if (v === undefined) continue;
    out[f] = f === 'dob' ? normaliseDob(v) ?? '' : v.trim();
  }
  return out;
}

/** Natural sort for classes and roll numbers ("2" before "10"). */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
type Sortable = { class?: string | null; section?: string | null; rollNo?: string | null; name?: string | null };
export function sortPeople<T extends Sortable>(people: T[]) {
  return people.sort(
    (a, b) =>
      collator.compare(a.class ?? '', b.class ?? '') ||
      collator.compare(a.section ?? '', b.section ?? '') ||
      collator.compare(a.rollNo ?? '', b.rollNo ?? '') ||
      collator.compare(a.name ?? '', b.name ?? ''),
  );
}

export async function listPeople(institution: string, kind: PersonKind) {
  const people = await PersonModel.find({ institution, kind }).lean();
  const ids = people.map((p) => p.photo?.file).filter(Boolean);
  const files = await FileModel.find({ _id: { $in: ids }, status: { $ne: 'deleted' } }).select('key bucket').lean();
  const byId = new Map(files.map((f) => [String(f._id), f]));
  return Promise.all(sortPeople(people).map(async ({ photo, ...p }) => {
    const file = photo?.file ? byId.get(String(photo.file)) : undefined;
    const live = Boolean(file);
    return {
      ...p,
      hasPhoto: live,
      photoSource: live ? photo?.source : undefined,
      // Signed for an hour: enough for a session of checking and capturing photos.
      photoUrl: file ? await presignDownload(file.bucket as 'private', file.key, `${p.code}.jpg`, 3600) : undefined,
    };
  }));
}

export async function createPerson(institution: string, kind: PersonKind, fields: Partial<Record<RosterField, string>>, actor: AuthContext) {
  const [code] = await nextCodes(1);
  return PersonModel.create({ institution, kind, code, ...cleanFields(fields), addedBy: actor.kind });
}

export async function findPerson(institution: string, id: string) {
  const person = await PersonModel.findOne({ _id: id, institution });
  if (!person) throw ApiError.notFound('Person');
  return person;
}

/** The old photo file is no longer needed once replaced or removed. */
async function releasePhoto(fileId?: Types.ObjectId | null) {
  if (fileId) await FileModel.updateOne({ _id: fileId }, { $set: { deleteAfter: new Date() } });
}

export async function deletePerson(person: PersonDoc) {
  await releasePhoto(person.photo?.file);
  await person.deleteOne();
}

export async function removePhoto(person: PersonDoc) {
  await releasePhoto(person.photo?.file);
  person.set('photo', undefined);
  await person.save();
}

/** Attaches an uploaded image (camera capture or file) as the person's photo. */
export async function setPhoto(person: PersonDoc, fileId: string, source: 'upload' | 'camera', actor: AuthContext) {
  const file = await FileModel.findOne({ _id: fileId, purpose: 'roster', status: 'uploaded' });
  const ownedByActor = file && String(file.owner.id) === actor.id && file.owner.kind === actor.kind;
  if (!file || !ownedByActor || file.attachedAt) throw ApiError.badRequest('Upload the photo again');
  if (!file.mimeType.startsWith('image/')) throw ApiError.badRequest('The photo must be a JPG, PNG or WEBP image');
  await releasePhoto(person.photo?.file);
  file.originalName = `${person.code}.jpg`;
  file.attachedAt = new Date();
  await file.save();
  person.set('photo', { file: file._id, source, updatedAt: new Date() });
  await person.save();
  return person;
}

async function storePhoto(bytes: Uint8Array, code: string, actor: AuthContext) {
  const jpeg = await sharp(bytes).rotate().resize(PHOTO.width, PHOTO.height, { fit: 'cover', position: 'attention' }).jpeg({ quality: 85 }).toBuffer();
  const now = new Date();
  const key = `roster/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${nanoid(21)}.jpg`;
  await putObject('private', key, jpeg, 'image/jpeg');
  return FileModel.create({
    key,
    bucket: 'private',
    originalName: `${code}.jpg`,
    mimeType: 'image/jpeg',
    size: jpeg.byteLength,
    purpose: 'roster',
    owner: { id: actor.id, kind: actor.kind },
    status: 'uploaded',
    sensitive: true,
    attachedAt: now,
  });
}

async function loadOwnFile(fileId: string, actor: AuthContext) {
  const file = await FileModel.findOne({ _id: fileId, status: 'uploaded', 'owner.id': actor.id, 'owner.kind': actor.kind });
  if (!file) throw ApiError.badRequest('Upload the file again');
  const bytes = await readObject(file.bucket as 'private', file.key);
  if (!bytes) throw ApiError.badRequest('Upload the file again');
  return { file, bytes };
}

export interface ImportResult {
  created: number;
  updated: number;
  photos: number;
  skipped: { row: number; reason: string }[];
  unknownColumns: string[];
}

/**
 * Adds a sheet of people to the list. Rows matching someone already there (same admission no.,
 * or same class + section + roll no.; employee id for staff) update that person instead of
 * creating a duplicate. An optional photos ZIP is matched by the photo column, roll no.,
 * admission no. or employee id.
 */
export async function importSheet(
  institution: string,
  kind: PersonKind,
  input: { fileId: string; photosFileId?: string },
  actor: AuthContext,
): Promise<ImportResult> {
  const sheet = await loadOwnFile(input.fileId, actor);
  let table;
  try {
    table = await parseTable(sheet.bytes, sheet.file.originalName);
  } catch (err) {
    throw ApiError.badRequest((err as Error).message);
  }
  const columns = table.headers.map((h) => matchHeader(h));
  const unknownColumns = table.headers.filter((h, i) => h && !columns[i]);
  if (!columns.includes('name')) throw ApiError.badRequest('The sheet needs a "Name" column');
  if (table.rows.length > MAX_IMPORT_ROWS) throw ApiError.badRequest(`Upload at most ${MAX_IMPORT_ROWS} rows at a time`);

  const photos = input.photosFileId ? readPhotosZip((await loadOwnFile(input.photosFileId, actor)).bytes) : null;
  const existing = await PersonModel.find({ institution, kind });
  const keyOf = (p: Partial<Record<RosterField, string>>) =>
    kind === 'staff'
      ? [p.employeeId && `e:${p.employeeId.toLowerCase()}`]
      : [p.admissionNo && `a:${p.admissionNo.toLowerCase()}`, p.rollNo && p.class && `r:${p.class}|${p.section ?? ''}|${p.rollNo}`.toLowerCase()];
  const index = new Map<string, PersonDoc>();
  for (const p of existing) for (const k of keyOf(p as Partial<Record<RosterField, string>>)) if (k) index.set(k, p);

  const result: ImportResult = { created: 0, updated: 0, photos: 0, skipped: [], unknownColumns };
  const rows: { row: number; fields: Partial<Record<RosterField, string>>; photoHint?: string }[] = [];
  table.rows.forEach((cells, i) => {
    const fields: Partial<Record<RosterField, string>> = {};
    let photoHint: string | undefined;
    columns.forEach((key, c) => {
      const value = cells[c]?.trim();
      if (!key || !value) return;
      if (key === 'photo') photoHint = value;
      else if ((ROSTER_FIELDS as readonly string[]).includes(key)) fields[key as RosterField] = value.slice(0, 200);
    });
    if (Object.keys(fields).length === 0) return; // blank line
    if (!fields.name) result.skipped.push({ row: i + 2, reason: 'Name is empty' });
    else rows.push({ row: i + 2, fields: cleanFields(fields), photoHint });
  });

  const fresh = rows.filter((r) => !keyOf(r.fields).some((k) => k && index.has(k)));
  const codes = fresh.length ? await nextCodes(fresh.length) : [];
  let next = 0;
  for (const { row, fields, photoHint } of rows) {
    let person = keyOf(fields).map((k) => k && index.get(k)).find(Boolean) as PersonDoc | undefined;
    if (person) {
      person.set(fields);
      result.updated += 1;
    } else {
      person = new PersonModel({ institution, kind, code: codes[next++], ...fields, addedBy: actor.kind });
      for (const k of keyOf(fields)) if (k) index.set(k, person);
      result.created += 1;
    }
    const hit = photos && findPhoto(photos, [photoHint, fields.rollNo, fields.admissionNo, fields.employeeId, person.code]);
    if (hit) {
      try {
        const file = await storePhoto(photos.files[hit]!, person.code, actor);
        await releasePhoto(person.photo?.file);
        person.set('photo', { file: file._id, source: 'import', updatedAt: new Date() });
        result.photos += 1;
      } catch (err) {
        logger.warn({ err, row }, 'Roster import: unreadable photo');
        result.skipped.push({ row, reason: `Photo "${hit.split('/').pop()}" could not be read` });
      }
    }
    await person.save();
  }

  // The sheet and ZIP have been copied into the list; they are not kept.
  await FileModel.updateMany({ _id: { $in: [input.fileId, input.photosFileId].filter(Boolean) } }, { $set: { deleteAfter: new Date() } });
  return result;
}

export function rosterFilter(institution: string, kind: PersonKind, cls?: string): FilterQuery<Person> {
  return { institution, kind, ...(cls ? { class: cls } : {}) };
}

/** Excel sheet in the same column order as the list, with each photo's file name. */
export async function exportXlsx(people: (Sortable & { code: string; photo?: { file?: unknown } | null })[], kind: PersonKind) {
  const fields = KIND_FIELDS[kind];
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(kind === 'staff' ? 'Staff' : 'Students', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'S.No', key: 'sno', width: 6 },
    { header: 'Code', key: 'code', width: 11 },
    ...fields.map((f) => ({ header: COLUMN_LABELS[f], key: f, width: f === 'address' ? 36 : f === 'name' || f.endsWith('Name') ? 24 : 13 })),
    { header: 'Photo', key: 'photo', width: 14 },
  ];
  sortPeople(people).forEach((p, i) => {
    sheet.addRow({
      sno: i + 1,
      code: p.code,
      ...Object.fromEntries(fields.map((f) => [f, (p as unknown as Record<string, string | undefined>)[f] ?? ''])),
      photo: p.photo?.file ? `${p.code}.jpg` : '',
    });
  });
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF142B4A' } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Every photo as <code>.jpg, ready for an ID card data merge. */
export async function exportPhotosZip(people: PersonDoc[]) {
  const ids = people.map((p) => p.photo?.file).filter(Boolean);
  const files = await FileModel.find({ _id: { $in: ids }, status: 'uploaded' }).select('key bucket').lean();
  const byId = new Map(files.map((f) => [String(f._id), f]));
  const entries: Record<string, Uint8Array> = {};
  for (const p of people) {
    const f = p.photo?.file && byId.get(String(p.photo.file));
    if (!f) continue;
    const bytes = await readObject(f.bucket as 'private', f.key);
    if (bytes) entries[`${p.code}.jpg`] = new Uint8Array(bytes);
  }
  // JPEGs are already compressed; storing them keeps the ZIP fast to build.
  return Buffer.from(zipSync(entries, { level: 0 }));
}
