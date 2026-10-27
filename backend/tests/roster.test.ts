import ExcelJS from 'exceljs';
import { unzipSync, zipSync } from 'fflate';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runFileRetention } from '@/jobs/file-retention';
import { FileModel } from '@/modules/uploads/file.model';
import { api, bearer, binary, connectTestDb, disconnectTestDb, institutionToken, seedBasics, staffToken, upload } from './helpers';

let school: string;
let other: string;
let admin: string;
let seed: Awaited<ReturnType<typeof seedBasics>>;

const photo = () => sharp({ create: { width: 640, height: 480, channels: 3, background: '#9cc3f5' } }).jpeg().toBuffer();
const csv = (rows: string[][]) => new TextEncoder().encode(rows.map((r) => r.join(',')).join('\r\n'));

beforeAll(async () => {
  await connectTestDb();
  seed = await seedBasics();
  school = await institutionToken('school@test.in');
  other = await institutionToken('pending@test.in');
  admin = await staffToken('owner@test.in');
});
afterAll(disconnectTestDb);

describe('student list', () => {
  it('imports a sheet with photos, gives every student a unique code, and updates on re-import', async () => {
    const sheet = await upload(school, {
      name: 'class-5.csv',
      mimeType: 'text/csv',
      purpose: 'roster',
      bytes: csv([
        ['Student Name', 'F. Name', 'DOB', 'Class', 'Section', 'Roll No', 'Photo'],
        ['Asha Verma', 'Ramesh Verma', '09/05/2015', '5', 'A', '1', 'asha.jpg'],
        ['Kabir Khan', 'Imran Khan', '2015-01-20', '5', 'A', '2', ''],
        ['', 'Nobody', '', '5', 'A', '3', ''],
      ]),
    });
    const zip = zipSync({ 'photos/asha.jpg': new Uint8Array(await photo()), 'photos/2.jpg': new Uint8Array(await photo()) });
    const photos = await upload(school, { name: 'photos.zip', mimeType: 'application/zip', purpose: 'roster', bytes: zip });

    const imported = await api()
      .post('/api/v1/institution/roster/import')
      .set(bearer(school))
      .send({ kind: 'student', fileId: sheet._id, photosFileId: photos._id })
      .expect(200);
    expect(imported.body).toMatchObject({ created: 2, updated: 0, photos: 2 });
    expect(imported.body.skipped).toEqual([{ row: 4, reason: 'Name is empty' }]);

    const list = await api().get('/api/v1/institution/roster?kind=student').set(bearer(school)).expect(200);
    expect(list.body).toMatchObject({ total: 2, withPhoto: 2 });
    const [asha, kabir] = list.body.items;
    expect(asha).toMatchObject({ name: 'Asha Verma', fatherName: 'Ramesh Verma', dob: '09-05-2015', class: '5', section: 'A', hasPhoto: true });
    expect(kabir.dob).toBe('20-01-2015');
    expect(asha.code).toMatch(/^PG\d{6}$/);
    expect(kabir.code).not.toBe(asha.code);
    // A real signed link, not a serialised promise.
    expect(typeof asha.photoUrl).toBe('string');

    // The same class again: matched by class + section + roll no., so nothing is duplicated.
    const again = await upload(school, { name: 'fix.csv', mimeType: 'text/csv', purpose: 'roster', bytes: csv([['Name', 'Class', 'Section', 'Roll No', 'Phone'], ['Asha Verma', '5', 'A', '1', '9876543210']]) });
    const second = await api().post('/api/v1/institution/roster/import').set(bearer(school)).send({ fileId: again._id }).expect(200);
    expect(second.body).toMatchObject({ created: 0, updated: 1 });
    const after = await api().get('/api/v1/institution/roster').set(bearer(school)).expect(200);
    expect(after.body.items[0]).toMatchObject({ code: asha.code, phone: '9876543210', hasPhoto: true });
  });

  it('adds a missed student at the end, takes a camera photo, and keeps other schools out', async () => {
    const added = await api()
      .post('/api/v1/institution/roster')
      .set(bearer(school))
      .send({ kind: 'student', name: 'Zoya Ali', fatherName: 'Arif Ali', dob: '2015-07-01', class: '5', section: 'A', rollNo: '3' })
      .expect(201);
    expect(added.body.dob).toBe('01-07-2015');

    const shot = await upload(school, { name: 'camera.jpg', mimeType: 'image/jpeg', purpose: 'roster', bytes: new Uint8Array(await photo()) });
    const withPhoto = await api().put(`/api/v1/institution/roster/${added.body._id}/photo`).set(bearer(school)).send({ fileId: shot._id, source: 'camera' }).expect(200);
    expect(withPhoto.body.photo.source).toBe('camera');
    expect((await FileModel.findById(shot._id))?.originalName).toBe(`${added.body.code}.jpg`);
    // A photo can belong to one person only.
    await api().put(`/api/v1/institution/roster/${added.body._id}/photo`).set(bearer(school)).send({ fileId: shot._id }).expect(400);

    await api().patch(`/api/v1/institution/roster/${added.body._id}`).set(bearer(other)).send({ section: 'B' }).expect(404);
    const list = await api().get('/api/v1/institution/roster').set(bearer(other)).expect(200);
    expect(list.body.total).toBe(0);
  });

  it('lets the shop edit the list, export it to Excel and download photos named by code', async () => {
    const base = `/api/v1/admin/institutions/${seed.institutions.school._id}/roster`;
    const list = await api().get(base).set(bearer(admin)).expect(200);
    expect(list.body.total).toBe(3);
    const zoya = list.body.items.find((p: { name: string }) => p.name === 'Zoya Ali');
    await api().patch(`${base}/${zoya._id}`).set(bearer(admin)).send({ bloodGroup: 'B+' }).expect(200);

    const xlsx = await api().get(`${base}/export.xlsx?kind=student`).set(bearer(admin)).buffer(true).parse(binary).expect(200);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(xlsx.body);
    const sheet = book.worksheets[0]!;
    expect(sheet.getRow(1).getCell(2).value).toBe('Code');
    expect(sheet.actualRowCount).toBe(4);
    const zoyaRow = sheet.getRow(4).values as unknown[];
    expect(zoyaRow).toContain('Zoya Ali');
    expect(zoyaRow).toContain('B+');
    expect(zoyaRow).toContain(`${zoya.code}.jpg`);

    const zip = await api().get(`${base}/photos.zip?kind=student`).set(bearer(admin)).buffer(true).parse(binary).expect(200);
    const names = Object.keys(unzipSync(new Uint8Array(zip.body))).sort();
    expect(names).toHaveLength(3);
    expect(names).toContain(`${zoya.code}.jpg`);
    // Schools download their sheet but not the photo bundle.
    await api().get('/api/v1/institution/roster/photos.zip').set(bearer(school)).expect(404);
  });

  it('frees a removed student’s photo for deletion', async () => {
    const list = await api().get('/api/v1/institution/roster').set(bearer(school)).expect(200);
    const zoya = list.body.items.find((p: { name: string }) => p.name === 'Zoya Ali');
    const fileId = (await FileModel.findOne({ originalName: `${zoya.code}.jpg`, attachedAt: { $exists: true } }))!._id;
    await api().delete(`/api/v1/institution/roster/${zoya._id}`).set(bearer(school)).expect(204);
    await runFileRetention();
    expect((await FileModel.findById(fileId))?.status).toBe('deleted');
  });
});
