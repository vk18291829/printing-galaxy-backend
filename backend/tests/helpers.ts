import mongoose from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { createApp } from '@/app';
import { env } from '@/config/env';
import { hashPassword } from '@/modules/auth/auth.service';
import { CategoryModel } from '@/modules/catalog/category.model';
import { ProductModel } from '@/modules/catalog/product.model';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { getSettings } from '@/modules/settings/settings.model';
import { UserModel } from '@/modules/users/user.model';
import { putPresigned } from './memory-storage';

export const app = createApp();
export const api = () => request(app);

export async function connectTestDb() {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.dropDatabase();
  // Unique indexes matter for the tests (invoice numbers, payments).
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

export async function disconnectTestDb() {
  await mongoose.disconnect();
}

const L = (en: string) => ({ en, hi: '' });
const book = (minQty: number, ...tiers: [number, number][]) => ({
  enabled: true,
  minQty,
  tiers: tiers.map(([q, p]) => ({ minQty: q, unitPrice: p })),
});

export const PASSWORD = 'Secret@123';

/** A small catalogue and one account of every kind. */
export async function seedBasics() {
  const settings = await getSettings();
  settings.set({
    shop: { name: 'Printing Galaxy', phone: '9876500000', whatsapp: '9876500000', address: 'Gwalior Road, Jhansi', state: 'Uttar Pradesh', gstin: '09ABCDE1234F1Z5' },
    tax: { enabled: true, rate: 18, pricesIncludeTax: true, sacCode: '998912' },
  });
  await settings.save();

  const category = await CategoryModel.create({ name: L('Printing'), slug: 'printing' });
  const [notes, pvc, studentId, teacherId, medal, project] = await ProductModel.create([
    {
      name: L('Notes Print'),
      slug: 'notes-print-bw',
      category: category._id,
      unit: 'page',
      requiresUpload: true,
      options: [
        {
          key: 'binding',
          label: L('Binding'),
          values: [
            { value: 'none', label: L('None'), isDefault: true },
            { value: 'spiral', label: L('Spiral'), fixedFee: 40, minCopies: 3 },
          ],
        },
      ],
      pricing: { retail: book(100, [1, 1.5], [300, 1.2]), institution: book(500, [500, 1]) },
    },
    {
      name: L('Aadhaar PVC Card'),
      slug: 'aadhaar-pvc-card',
      category: category._id,
      unit: 'card',
      workflow: 'identity',
      sensitive: true,
      requiresUpload: true,
      pricing: { retail: book(1, [1, 60]), institution: { enabled: false, minQty: 1, tiers: [] } },
    },
    {
      name: L('Student ID Card'),
      slug: 'student-id-card',
      category: category._id,
      unit: 'card',
      workflow: 'design',
      pricing: { retail: book(1, [1, 80]), institution: book(5, [5, 30], [200, 26]) },
    },
    {
      name: L('Teacher ID Card'),
      slug: 'teacher-id-card',
      category: category._id,
      unit: 'card',
      workflow: 'design',
      pricing: { retail: book(1, [1, 80]), institution: book(2, [2, 35]) },
    },
    {
      name: L('School Medal'),
      slug: 'school-medal',
      category: category._id,
      unit: 'piece',
      workflow: 'design',
      pricing: { retail: book(1, [1, 70]), institution: book(20, [20, 45]) },
    },
    {
      name: L('Project File'),
      slug: 'project-file-viva',
      category: category._id,
      unit: 'set',
      workflow: 'quote',
      pricing: { retail: book(1), institution: book(1) },
    },
  ]);

  const passwordHash = await hashPassword(PASSWORD);
  const [admin, staff, rider, rider2] = await UserModel.create([
    { name: 'Owner', email: 'owner@test.in', role: 'admin', passwordHash },
    { name: 'Counter Staff', email: 'staff@test.in', role: 'staff', passwordHash },
    { name: 'Ravi Rider', email: 'rider@test.in', role: 'delivery', passwordHash, phone: '9000000001' },
    { name: 'Other Rider', email: 'rider2@test.in', role: 'delivery', passwordHash, phone: '9000000002' },
  ]);

  const address = { line1: '1 School Road', city: 'Jhansi', state: 'Uttar Pradesh', pincode: '284001' };
  const [school, pendingSchool] = await InstitutionModel.create([
    { name: 'Sunrise Public School', type: 'school', contactName: 'Principal', email: 'school@test.in', phone: '9811111111', passwordHash, address, status: 'approved' },
    { name: 'New Pending School', type: 'school', contactName: 'Clerk', email: 'pending@test.in', phone: '9822222222', passwordHash, address, status: 'pending' },
  ]);

  return { category, products: { notes: notes!, pvc: pvc!, studentId: studentId!, teacherId: teacherId!, medal: medal!, project: project! }, users: { admin: admin!, staff: staff!, rider: rider!, rider2: rider2! }, institutions: { school: school!, pendingSchool: pendingSchool! } };
}

export async function staffToken(email: string) {
  const res = await api().post('/api/v1/auth/staff/login').send({ email, password: PASSWORD }).expect(200);
  return res.body.accessToken as string;
}

export async function institutionToken(email: string) {
  const res = await api().post('/api/v1/auth/institution/login').send({ email, password: PASSWORD }).expect(200);
  return res.body.accessToken as string;
}

export async function customerToken(phone: string) {
  const otp = await api().post('/api/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await api().post('/api/v1/auth/otp/verify').send({ phone, code: otp.body.devCode, name: 'Test Customer' }).expect(200);
  return res.body.accessToken as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Presign → "browser" PUT → complete, exactly like the frontends. */
export async function upload(
  token: string,
  file: { name: string; mimeType: string; bytes: Uint8Array; purpose?: string; productId?: string },
) {
  const presign = await api()
    .post('/api/v1/uploads/presign')
    .set(bearer(token))
    .send({ fileName: file.name, mimeType: file.mimeType, size: file.bytes.byteLength, purpose: file.purpose ?? 'order', productId: file.productId })
    .expect(201);
  putPresigned(presign.body.uploadUrl, file.bytes);
  const done = await api().post(`/api/v1/uploads/${presign.body.fileId}/complete`).set(bearer(token)).expect(200);
  return done.body as { _id: string; pageCount?: number; sensitive: boolean };
}

export async function pdfWithPages(pages: number) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) pdf.addPage([595, 842]);
  return pdf.save();
}

/** Mutable copy of env for tests that switch integrations on. */
export function withEnv(patch: Partial<typeof env>) {
  const before = { ...env };
  Object.assign(env, patch);
  return () => Object.assign(env, before);
}
