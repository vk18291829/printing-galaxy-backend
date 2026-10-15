import ExcelJS from 'exceljs';
import { zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { idle } from '@/jobs/queue';
import { BulkJobModel } from '@/modules/bulk/bulk.model';
import { FileModel } from '@/modules/uploads/file.model';
import { api, bearer, binary, connectTestDb, disconnectTestDb, institutionToken, seedBasics, staffToken, upload } from './helpers';
import { objects } from './memory-storage';

let school: string;
let admin: string;
let templateId: string;

const photo = (w = 600, h = 750) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#9cc3f5' } }).jpeg().toBuffer();

async function photosZip(names: string[], small: string[] = []) {
  const entries: Record<string, Uint8Array> = {};
  for (const n of names) entries[`class-7/${n}`] = new Uint8Array(await photo(small.includes(n) ? 80 : 600, small.includes(n) ? 100 : 750));
  entries['__MACOSX/._1001.jpg'] = new Uint8Array([0]);
  entries['class-7/readme.txt'] = new TextEncoder().encode('hi');
  return zipSync(entries);
}

const csv = (rows: string[][]) => new TextEncoder().encode(rows.map((r) => r.join(',')).join('\r\n'));

async function createJob(list: { name: string; bytes: Uint8Array; mime: string }, zip?: Uint8Array, template = templateId) {
  const data = await upload(school, { name: list.name, mimeType: list.mime, bytes: list.bytes, purpose: 'bulk' });
  const photos = zip ? await upload(school, { name: 'photos.zip', mimeType: 'application/zip', bytes: zip, purpose: 'bulk' }) : undefined;
  const res = await api().post('/api/v1/institution/bulk-jobs').set(bearer(school)).send({ templateId: template, dataFileId: data._id, photosFileId: photos?._id }).expect(201);
  await idle();
  return (await api().get(`/api/v1/institution/bulk-jobs/${res.body._id}`).set(bearer(school)).expect(200)).body;
}

beforeAll(async () => {
  await connectTestDb();
  await seedBasics();
  school = await institutionToken('school@test.in');
  admin = await staffToken('owner@test.in');
});
afterAll(disconnectTestDb);

describe('institution card templates', () => {
  it('describes the card types with their columns', async () => {
    const kinds = await api().get('/api/v1/institution/card-kinds').set(bearer(school)).expect(200);
    const teacher = kinds.body.find((k: { kind: string }) => k.kind === 'teacher_id');
    expect(teacher).toMatchObject({ idField: 'employeeId', productSlug: 'teacher-id-card', size: { w: 86, h: 54 } });
    expect(teacher.required).toEqual(['name', 'employeeId', 'designation']);
  });

  it('saves a template with a logo and renders a sample sheet', async () => {
    const logo = await upload(school, { name: 'logo.png', mimeType: 'image/png', bytes: await sharp({ create: { width: 200, height: 200, channels: 4, background: '#0B5D3B' } }).png().toBuffer(), purpose: 'logo' });
    await api()
      .post('/api/v1/institution/templates')
      .set(bearer(school))
      .send({ name: 'Bad', kind: 'student_id', colors: { primary: '#0B5D3B', accent: '#FFC20E', text: '#131A2B' }, fields: ['designation'] })
      .expect(422);

    const res = await api()
      .post('/api/v1/institution/templates')
      .set(bearer(school))
      .send({
        name: 'Students 2026-27',
        kind: 'student_id',
        orientation: 'landscape',
        logoFileId: logo._id,
        colors: { primary: '#0B5D3B', accent: '#FFC20E', text: '#131A2B' },
        subText: 'Affiliated to CBSE',
        fields: ['class', 'rollNo', 'fatherName', 'bloodGroup'],
        validUpto: 'March 2027',
      })
      .expect(201);
    templateId = res.body._id;
    expect(res.body.logoUrl).toMatch(/^https:\/\/public\.test\/logo\//);

    const sample = await api().get(`/api/v1/institution/templates/${templateId}/sample`).set(bearer(school)).buffer(true).parse(binary).expect(200);
    const pdf = await PDFDocument.load(sample.body as Buffer);
    // One sheet: fronts, then mirrored backs.
    expect(pdf.getPageCount()).toBe(2);
  });
});

describe('bulk lists', () => {
  it('reports every problem with Excel row numbers', async () => {
    const job = await createJob(
      {
        name: 'class7.csv',
        mime: 'text/csv',
        bytes: csv([
          ['Student Name', 'Roll No.', 'Class', 'Sec', 'Mobile No', 'Favourite colour'],
          ['Aarav Sharma', '1001', 'VII', 'B', '9876543210', 'blue'],
          ['Ananya Verma', '1002', '', 'B', '12345', 'red'],
          ['Kabir Khan', '1001', 'VII', 'B', '9876543211', ''],
          ['Diya Patel', '1004', 'VII', 'B', '9876543212', ''],
          ['Rohan Gupta', '1005', 'VII', 'B', '9876543213', ''],
          ['', '', '', '', '', ''],
        ]),
      },
      await photosZip(['1001.jpg', '1002.JPG', '1005.png', 'stray.jpg'], ['1005.png']),
    );
    expect(job.status).toBe('needs_fixes');
    expect(job.report).toMatchObject({ rows: 5, photosInZip: 4 });
    const errors = job.report.errors.map((e: { row?: number; message: string }) => `${e.row ?? '-'}: ${e.message}`);
    expect(errors).toEqual(
      expect.arrayContaining([
        '3: class is empty',
        expect.stringMatching(/^4: Duplicate rollNo "1001" \(also on row 2\)/),
        expect.stringMatching(/^5: Photo 1004\.jpg not found/),
        expect.stringMatching(/^6: Photo is too small \(80×100 px\)/),
      ]),
    );
    const warnings = job.report.warnings.map((w: { message: string }) => w.message).join('\n');
    expect(warnings).toContain('Favourite colour');
    expect(warnings).toContain('does not look like a 10-digit mobile number');
    expect(warnings).toContain('match no row: stray.jpg');
    expect(warnings).toContain('non-image file');
  });

  it('turns a clean list into a print sheet and an order with the sheet as proof', async () => {
    const names = ['Aarav Sharma', 'Ananya Verma', 'Kabir Khan', 'Diya Patel', 'Rohan Gupta', 'Isha Singh'];
    const job = await createJob(
      {
        name: 'class7.csv',
        mime: 'text/csv',
        bytes: csv([['Name', 'Roll No', 'Class', 'Section', "Father's Name"], ...names.map((n, i) => [n, String(1001 + i), 'VII', 'B', 'Mr. Parent'])]),
      },
      await photosZip(names.map((_, i) => `${1001 + i}.jpg`)),
    );
    expect(job.report.errors).toEqual([]);
    expect(job.status).toBe('ready');
    expect(job.output).toMatchObject({ cards: 6, sheets: 1 });
    expect(job.preview[0]).toMatchObject({ row: 2, data: { name: 'Aarav Sharma', rollNo: '1001', class: 'VII', section: 'B' }, photo: '1001.jpg' });

    const sheet = await FileModel.findById(job.output.file).lean();
    const stored = objects.get(`private/${sheet!.key}`)!;
    expect((await PDFDocument.load(stored)).getPageCount()).toBe(2);

    const order = await api()
      .post(`/api/v1/institution/bulk-jobs/${job._id}/order`)
      .set(bearer(school))
      .send({ fulfilment: { method: 'pickup' }, paymentMethod: 'counter' })
      .expect(201);
    expect(order.body.status).toBe('proof_sent');
    expect(order.body.audience).toBe('institution');
    expect(order.body.items[0]).toMatchObject({ quantity: 6, unitPrice: 30, lineTotal: 180 });
    expect(order.body.items[0].proofs[0]).toMatchObject({ status: 'pending', file: job.output.file });
    // The list and photos travel with the order; personal data is marked sensitive.
    const files = await FileModel.find({ _id: { $in: order.body.items[0].files } }).lean();
    expect(files.map((f) => f.sensitive)).toEqual([true, true]);

    await api().post(`/api/v1/institution/bulk-jobs/${job._id}/order`).set(bearer(school)).send({ fulfilment: { method: 'pickup' }, paymentMethod: 'counter' }).expect(409);
    const approved = await api().post(`/api/v1/orders/${order.body._id}/items/${order.body.items[0]._id}/proof`).set(bearer(school)).send({ decision: 'approved' }).expect(200);
    expect(approved.body.status).toBe('approved');
    expect((await BulkJobModel.findById(job._id).lean())?.status).toBe('ordered');
  });

  it('enforces the institution minimum for the card product', async () => {
    const job = await createJob(
      { name: 'small.csv', mime: 'text/csv', bytes: csv([['Name', 'Roll No', 'Class'], ['A', '1', 'I'], ['B', '2', 'I']]) },
      await photosZip(['1.jpg', '2.jpg']),
    );
    expect(job.status).toBe('needs_fixes');
    expect(job.report.errors[0].message).toBe('Minimum order is 5 cards. This list has 2.');
  });

  it('reads teacher lists from Excel on the separate teacher template', async () => {
    const tpl = await api()
      .post('/api/v1/institution/templates')
      .set(bearer(school))
      .send({ name: 'Staff', kind: 'teacher_id', orientation: 'portrait', colors: { primary: '#131A2B', accent: '#D9138A', text: '#131A2B' }, fields: [] })
      .expect(201);
    expect(tpl.body.fields).toEqual(['designation', 'employeeId', 'department', 'bloodGroup', 'phone']);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Staff');
    ws.addRow(['Teacher Name', 'Emp Code', 'Designation', 'Date of Birth', 'Photo']);
    ws.addRow(['Meena Gupta', 'T-017', 'PGT Maths', new Date(Date.UTC(1986, 6, 2)), 'meena.jpg']);
    ws.addRow([{ richText: [{ text: 'Rohit ' }, { text: 'Singh' }] }, 'T-021', 'TGT English', null, 'rohit.jpg']);
    const bytes = new Uint8Array(await wb.xlsx.writeBuffer());

    const job = await createJob(
      { name: 'staff.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes },
      await photosZip(['meena.jpg', 'rohit.jpg']),
      tpl.body._id,
    );
    expect(job.report.errors).toEqual([]);
    expect(job.status).toBe('ready');
    expect(job.preview.map((p: { data: Record<string, string> }) => p.data)).toEqual([
      { name: 'Meena Gupta', employeeId: 'T-017', designation: 'PGT Maths', dob: '02-07-1986', photo: 'meena.jpg' },
      { name: 'Rohit Singh', employeeId: 'T-021', designation: 'TGT English', photo: 'rohit.jpg' },
    ]);
  });

  it('lets staff list jobs and rebuild a sheet', async () => {
    const list = await api().get('/api/v1/admin/bulk-jobs').set(bearer(admin)).expect(200);
    expect(list.body.total).toBe(4);
    const ready = list.body.items.find((j: { status: string }) => j.status === 'ready');
    const detail = await api().get(`/api/v1/admin/bulk-jobs/${ready._id}`).set(bearer(admin)).expect(200);
    expect(detail.body.institution.name).toBe('Sunrise Public School');

    await api().post(`/api/v1/admin/bulk-jobs/${ready._id}/rerun`).set(bearer(admin)).send({ step: 'generate' }).expect(200);
    await idle();
    const after = await api().get(`/api/v1/admin/bulk-jobs/${ready._id}`).set(bearer(admin)).expect(200);
    expect(after.body.status).toBe('ready');
    expect(after.body.output.file._id).not.toBe(detail.body.output.file._id);
    // The replaced sheet is removed from storage.
    expect((await FileModel.findById(detail.body.output.file._id).lean())?.status).toBe('deleted');
  });

  it('keeps other institutions out', async () => {
    const other = await institutionToken('pending@test.in');
    const jobs = await api().get('/api/v1/institution/bulk-jobs').set(bearer(other)).expect(200);
    expect(jobs.body).toEqual([]);
    await api().get(`/api/v1/institution/templates/${templateId}/sample`).set(bearer(other)).expect(404);
  });
});
