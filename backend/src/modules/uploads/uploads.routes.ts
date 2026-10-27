import path from 'node:path';
import { Router } from 'express';
import { nanoid } from 'nanoid';
import { PDFDocument } from 'pdf-lib';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { STAFF_ROLES, type AuthContext, type UserRole } from '@/common/types';
import { objectId } from '@/common/validation';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { authenticate } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { ProductModel } from '@/modules/catalog/product.model';
import { OrderModel } from '@/modules/orders/order.model';
import { FileModel, type FileObjectDoc } from './file.model';
import { deleteObject, headObject, presignDownload, presignUpload, publicUrl, readObject } from './storage';

export const uploadsRouter = Router();

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip',
};

const isStaff = (auth: AuthContext) =>
  auth.kind === 'user' && STAFF_ROLES.includes(auth.role as UserRole);

function ownsFile(auth: AuthContext, file: FileObjectDoc) {
  return isStaff(auth) || (String(file.owner.id) === auth.id && file.owner.kind === auth.kind);
}

/** Read access also covers files attached to the customer's own order (e.g. proofs uploaded by staff). */
async function canReadFile(auth: AuthContext, file: FileObjectDoc) {
  if (ownsFile(auth, file)) return true;
  if (!file.order || file.sensitive) return false;
  const owner = auth.kind === 'institution' ? { institution: auth.id } : { customer: auth.id };
  return Boolean(await OrderModel.exists({ _id: file.order, ...owner }));
}

const presignSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().refine((t) => t in ALLOWED_TYPES, 'This file type is not supported'),
  size: z.coerce
    .number()
    .int()
    .positive()
    .max(env.MAX_UPLOAD_MB * 1024 * 1024, `Files must be smaller than ${env.MAX_UPLOAD_MB} MB`),
  purpose: z.enum(['order', 'logo', 'proof', 'catalog', 'bulk', 'roster']).default('order'),
  productId: objectId.optional(),
});

uploadsRouter.post('/presign', authenticate, validate({ body: presignSchema }), async (req, res) => {
  const auth = req.auth!;
  const input = req.body as z.infer<typeof presignSchema>;

  if ((input.purpose === 'proof' || input.purpose === 'catalog') && !isStaff(auth)) {
    throw ApiError.forbidden();
  }
  if ((input.purpose === 'bulk' || input.purpose === 'roster') && auth.kind !== 'institution' && !isStaff(auth)) {
    throw ApiError.forbidden();
  }

  // Class lists and student photos are personal data: private, deleted after the retention period.
  let sensitive = input.purpose === 'bulk' || input.purpose === 'roster';
  if (input.productId) {
    const product = await ProductModel.findById(input.productId).select('sensitive').lean();
    sensitive ||= Boolean(product?.sensitive);
  }

  const bucket = input.purpose === 'catalog' || input.purpose === 'logo' ? 'public' : 'private';
  const ext = ALLOWED_TYPES[input.mimeType] ?? path.extname(input.fileName).slice(1);
  const now = new Date();
  const key = `${input.purpose}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${nanoid(21)}.${ext}`;

  const file = await FileModel.create({
    key,
    bucket,
    originalName: input.fileName,
    mimeType: input.mimeType,
    size: input.size,
    purpose: input.purpose,
    owner: { id: auth.id, kind: auth.kind },
    sensitive,
    publicUrl: bucket === 'public' ? publicUrl(key) : undefined,
  });

  const { url: uploadUrl, headers } = await presignUpload(bucket, key, input.mimeType, input.size);
  res.status(201).json({ fileId: file.id, uploadUrl, method: 'PUT', headers });
});

async function countPdfPages(bucket: 'private' | 'public', key: string) {
  try {
    const bytes = await readObject(bucket, key);
    if (!bytes) return null;
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return pdf.getPageCount();
  } catch (err) {
    logger.warn({ err, key }, 'Could not read PDF page count');
    return null;
  }
}

uploadsRouter.post(
  '/:id/complete',
  authenticate,
  validate({ params: z.object({ id: objectId }) }),
  async (req, res) => {
    const file = await FileModel.findById(req.params.id);
    if (!file || !ownsFile(req.auth!, file)) throw ApiError.notFound('File');

    const bucket = file.bucket as 'private' | 'public';
    const head = await headObject(bucket, file.key);
    if (!head) throw ApiError.badRequest('Upload did not finish. Please try again.');

    file.size = head.ContentLength ?? file.size;
    file.status = 'uploaded';
    let readable = true;
    if (file.mimeType === 'application/pdf') {
      const pages = await countPdfPages(bucket, file.key);
      readable = pages !== null;
      if (pages !== null) file.pageCount = pages;
    }
    await file.save();
    res.json({ ...file.toJSON(), readable });
  },
);

uploadsRouter.get(
  '/:id/url',
  authenticate,
  validate({ params: z.object({ id: objectId }) }),
  async (req, res) => {
    const file = await FileModel.findById(req.params.id);
    if (!file || file.status !== 'uploaded' || !(await canReadFile(req.auth!, file))) {
      throw ApiError.notFound('File');
    }
    if (file.publicUrl) {
      res.json({ url: file.publicUrl });
      return;
    }
    // Sensitive identity documents get a very short-lived link.
    const url = await presignDownload('private', file.key, file.originalName, file.sensitive ? 60 : 300);
    res.json({ url, expiresIn: file.sensitive ? 60 : 300 });
  },
);

uploadsRouter.delete(
  '/:id',
  authenticate,
  validate({ params: z.object({ id: objectId }) }),
  async (req, res) => {
    const file = await FileModel.findById(req.params.id);
    if (!file || !ownsFile(req.auth!, file)) throw ApiError.notFound('File');
    if (file.order) throw ApiError.conflict('This file is attached to an order');
    await deleteObject(file.bucket as 'private' | 'public', file.key).catch(() => undefined);
    await file.deleteOne();
    res.status(204).end();
  },
);
