import { nanoid } from 'nanoid';
import { ApiError } from '@/common/errors';
import type { AuthContext } from '@/common/types';
import { logger } from '@/config/logger';
import { enqueue, registerHandler } from '@/jobs/queue';
import { audit } from '@/modules/audit/audit.model';
import { ProductModel } from '@/modules/catalog/product.model';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { resolvePricingContext } from '@/modules/institutions/institution.service';
import { notifications } from '@/modules/notifications/notification.service';
import { OrderModel } from '@/modules/orders/order.model';
import {
  buildItems,
  changeStatus,
  persistOrder,
  computeTotals,
  resolveContact,
} from '@/modules/orders/order.service';
import { quoteProduct } from '@/modules/pricing/pricing.service';
import { getSettings } from '@/modules/settings/settings.model';
import { FileModel } from '@/modules/uploads/file.model';
import { deleteObject, putObject, readObject } from '@/modules/uploads/storage';
import { renderCardSheets, type CardTemplate } from './card-renderer';
import { KIND_SPECS, type CardKind, type FieldKey } from './card-kinds';
import { BulkJobModel, InstitutionTemplateModel, type BulkJobDoc, type InstitutionTemplate } from './bulk.model';
import { parseTable, readPhotosZip, type PhotoIndex } from './spreadsheet';
import { validateTable } from './validate';

async function readFile(fileId: unknown) {
  const file = await FileModel.findById(fileId);
  if (!file || file.status !== 'uploaded') throw ApiError.badRequest('An uploaded file is missing. Please upload it again.');
  const bytes = await readObject(file.bucket as 'private' | 'public', file.key);
  if (!bytes) throw new Error(`Storage returned no data for ${file.key}`);
  return { file, bytes };
}

async function loadPhotos(job: BulkJobDoc): Promise<PhotoIndex | null> {
  if (!job.photosFile) return null;
  const { bytes } = await readFile(job.photosFile);
  return readPhotosZip(bytes);
}

/** The template as the renderer needs it, with the institution's name and phone as fallbacks. */
export async function toCardTemplate(template: InstitutionTemplate): Promise<CardTemplate> {
  const institution = await InstitutionModel.findById(template.institution).select('name phone address').lean();
  const address = institution?.address;
  return {
    kind: template.kind as CardKind,
    orientation: template.orientation as 'landscape' | 'portrait',
    colors: {
      primary: template.colors?.primary ?? '#1D6CF0',
      accent: template.colors?.accent ?? '#FFC20E',
      text: template.colors?.text ?? '#131A2B',
    },
    headerText: template.headerText || institution?.name || 'Institution',
    subText: template.subText || (address ? [address.line1, address.city].filter(Boolean).join(', ') : ''),
    fields: (template.fields?.length ? template.fields : KIND_SPECS[template.kind as CardKind].defaultFields) as FieldKey[],
    backText: template.backText ?? undefined,
    signatureLabel: template.signatureLabel ?? undefined,
    validUpto: template.validUpto ?? undefined,
    institutionPhone: institution?.phone ? `+91 ${institution.phone}` : undefined,
  };
}

export async function loadLogo(template: Pick<InstitutionTemplate, 'logo'>) {
  if (!template.logo) return null;
  try {
    return (await readFile(template.logo)).bytes;
  } catch (err) {
    logger.warn({ err }, 'Template logo could not be read');
    return null;
  }
}

async function fail(job: BulkJobDoc, err: unknown) {
  logger.error({ err, bulkJobId: job.id }, 'Bulk job failed');
  job.status = 'failed';
  job.error = err instanceof Error ? err.message : String(err);
  await job.save();
  const settings = await getSettings();
  void notifications.staffAlert(
    settings.shop.whatsapp || settings.shop.phone,
    'bulk_job_failed',
    `Bulk card job ${job.id} failed: ${job.error}`,
  );
}

async function runValidate({ bulkJobId }: { bulkJobId: string }) {
  const job = await BulkJobModel.findById(bulkJobId);
  if (!job || !['queued', 'validating'].includes(job.status)) return;
  job.status = 'validating';
  job.attempts += 1;
  job.error = undefined;
  await job.save();

  try {
    const { file, bytes } = await readFile(job.dataFile);
    let table;
    let photos: PhotoIndex | null;
    try {
      table = await parseTable(bytes, file.originalName);
      photos = await loadPhotos(job);
    } catch (err) {
      // A file we cannot read is the institution's to fix, not a system failure.
      job.set('report', {
        rows: 0,
        validRows: 0,
        errors: [{ message: err instanceof Error ? err.message : 'The file could not be read' }],
        warnings: [],
      });
      job.status = 'needs_fixes';
      await job.save();
      return;
    }

    const result = await validateTable(job.kind as CardKind, table, photos);

    // The institution's minimum order for this product applies to the list as a whole.
    const product = await ProductModel.findById(job.product).lean();
    if (product && result.report.validRows > 0) {
      const ctx = await resolvePricingContext({ id: String(job.institution), kind: 'institution', role: 'institution' });
      const quote = quoteProduct(product, ctx.audience, { options: Object.fromEntries(job.options ?? []), quantity: result.records.length }, ctx.discountPercent);
      for (const e of quote.errors) {
        if (e.code === 'MIN_QTY') result.report.errors.unshift({ message: `${e.message}. This list has ${result.records.length}.` });
        if (e.code === 'NOT_AVAILABLE') {
          result.report.errors.unshift({
            message: ctx.audience === 'retail' ? `${e.message}. It unlocks once your institution account is approved.` : e.message,
          });
        }
      }
    }

    job.set('report', result.report);
    job.set('records', result.records);
    job.status = result.report.errors.length ? 'needs_fixes' : 'generating';
    await job.save();
    if (job.status === 'generating') await enqueue('bulk.generate', { bulkJobId: job.id });
  } catch (err) {
    await fail(job, err);
  }
}

async function runGenerate({ bulkJobId }: { bulkJobId: string }) {
  const job = await BulkJobModel.findById(bulkJobId).select('+records');
  if (!job || job.status !== 'generating') return;
  try {
    const template = await InstitutionTemplateModel.findById(job.template).lean();
    if (!template) throw new Error('The card template was deleted');
    const photos = await loadPhotos(job);
    const cardTemplate = await toCardTemplate(template);
    const records = job.records.map((r) => ({
      data: Object.fromEntries(r.data ?? []),
      photo: r.photo && photos ? photos.files[r.photo] : undefined,
    }));
    const { bytes, sheets } = await renderCardSheets({
      template: cardTemplate,
      records,
      logo: await loadLogo(template),
      title: `${cardTemplate.headerText} - ${KIND_SPECS[cardTemplate.kind].label}`,
    });

    const now = new Date();
    const key = `bulk/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${nanoid(21)}.pdf`;
    await putObject('private', key, bytes, 'application/pdf');
    const output = await FileModel.create({
      key,
      bucket: 'private',
      originalName: `${KIND_SPECS[cardTemplate.kind].label.replace(/[^\w]+/g, '-')}-${records.length}-cards.pdf`,
      mimeType: 'application/pdf',
      size: bytes.byteLength,
      pageCount: sheets * 2,
      purpose: 'bulk',
      owner: { id: job.institution, kind: 'institution' },
      status: 'uploaded',
      order: job.order ?? undefined,
    });

    // A regenerated sheet replaces the previous one unless that one is already on an order.
    const previous = job.output?.file ? await FileModel.findById(job.output.file) : null;
    if (previous && !previous.order) {
      await deleteObject('private', previous.key).catch(() => undefined);
      previous.status = 'deleted';
      await previous.save();
    }

    job.set('output', { file: output._id, sheets, cards: records.length, generatedAt: new Date() });
    job.status = job.order ? 'ordered' : 'ready';
    await job.save();
  } catch (err) {
    await fail(job, err);
  }
}

registerHandler('bulk.validate', runValidate);
registerHandler('bulk.generate', runGenerate);

/** Jobs interrupted by a restart in in-process mode are picked up again on boot. */
export async function resumeBulkJobs() {
  const stuck = await BulkJobModel.find({ status: { $in: ['queued', 'validating', 'generating'] } }).select('status').lean();
  for (const j of stuck) {
    if (j.status === 'generating') await enqueue('bulk.generate', { bulkJobId: String(j._id) });
    else {
      await BulkJobModel.updateOne({ _id: j._id }, { status: 'queued' });
      await enqueue('bulk.validate', { bulkJobId: String(j._id) });
    }
  }
  if (stuck.length) logger.info({ count: stuck.length }, 'Resumed bulk jobs');
}

export async function createBulkJob(
  auth: AuthContext,
  input: { templateId: string; productId?: string; options?: Record<string, string>; dataFileId: string; photosFileId?: string },
) {
  const template = await InstitutionTemplateModel.findOne({ _id: input.templateId, institution: auth.id, isActive: true });
  if (!template) throw ApiError.notFound('Template');
  const spec = KIND_SPECS[template.kind as CardKind];
  const product = input.productId
    ? await ProductModel.findOne({ _id: input.productId, isActive: true })
    : await ProductModel.findOne({ slug: spec.productSlug, isActive: true });
  if (!product) throw ApiError.badRequest(`The product for ${spec.label} is not available`);

  const fileIds = [input.dataFileId, input.photosFileId].filter(Boolean);
  const files = await FileModel.find({ _id: { $in: fileIds }, 'owner.id': auth.id, status: 'uploaded' });
  if (files.length !== fileIds.length) throw ApiError.badRequest('Upload the files again and retry');
  const data = files.find((f) => String(f._id) === input.dataFileId)!;
  if (!/\.(csv|xlsx|xls)$/i.test(data.originalName)) throw ApiError.badRequest('The list must be an Excel (.xlsx) or CSV file');
  const zip = files.find((f) => String(f._id) === input.photosFileId);
  if (zip && !/\.zip$/i.test(zip.originalName)) throw ApiError.badRequest('Photos must be uploaded as one .zip file');

  const job = await BulkJobModel.create({
    institution: auth.id,
    template: template._id,
    kind: template.kind,
    product: product._id,
    options: input.options ?? {},
    dataFile: data._id,
    photosFile: zip?._id,
  });
  await enqueue('bulk.validate', { bulkJobId: job.id });
  return job;
}

/** Re-runs validation (staff after a fix) or just regenerates the sheet (template changed). */
export async function rerunBulkJob(job: BulkJobDoc, step: 'validate' | 'generate') {
  if (job.status === 'ordered' && step === 'validate') throw ApiError.conflict('This list is already on an order');
  if (step === 'generate' && !job.report?.rows) throw ApiError.conflict('Validate the list first');
  job.status = step === 'validate' ? 'queued' : 'generating';
  job.error = undefined;
  await job.save();
  await enqueue(step === 'validate' ? 'bulk.validate' : 'bulk.generate', { bulkJobId: job.id });
  return job;
}

export async function placeBulkOrder(
  auth: AuthContext,
  job: BulkJobDoc,
  input: { fulfilment: { method: 'pickup' | 'delivery'; address?: unknown }; paymentMethod: 'online' | 'counter'; customerNote?: string },
) {
  if (job.status !== 'ready' || !job.output?.file) throw ApiError.conflict('The print sheet is not ready yet');
  const settings = await getSettings();
  if (input.fulfilment.method === 'delivery' && !settings.delivery.enabled) throw ApiError.badRequest('Home delivery is not available right now');
  if (input.paymentMethod === 'online' && !settings.payments.onlineEnabled) throw ApiError.badRequest('Online payment is not available right now');
  if (input.paymentMethod === 'counter' && !settings.payments.counterEnabled) throw ApiError.badRequest('Pay at counter is not available right now');

  const ctx = await resolvePricingContext(auth);
  const cards = job.output.cards ?? job.report?.rows ?? 0;
  const [item] = await buildItems(
    [{
      productId: String(job.product),
      options: Object.fromEntries(job.options ?? []),
      quantity: cards,
      fileIds: [],
      notes: `Bulk list: ${cards} cards (job ${job.id})`,
    }],
    ctx,
    undefined,
    { requireUploads: false },
  );
  if (!item) throw ApiError.unprocessable('Nothing to order');
  item.files = [job.dataFile, job.photosFile].filter(Boolean) as typeof item.files;

  const totals = await computeTotals(item.lineTotal, input.fulfilment.method);
  const who = await resolveContact(auth);
  // Keyed on the job: placing the same sheet twice returns the first order.
  const { order, replayed } = await persistOrder({
    audience: ctx.audience,
    ...who,
    source: 'online',
    items: [item],
    status: 'received',
    statusHistory: [{ status: 'received', by: auth.id, byKind: auth.kind, at: new Date(), note: 'Bulk card order' }],
    fulfilment: input.fulfilment,
    totals,
    payment: { method: input.paymentMethod, status: 'pending', amountPaid: 0 },
    customerNote: input.customerNote,
  }, `bulkjob:${job.id}`);
  if (replayed) return order;
  await FileModel.updateOne({ _id: job.output.file }, { $set: { order: order._id } });

  // The generated sheet is the proof: the institution checks every card before printing.
  order.items[0]!.proofs.push({
    file: job.output.file,
    message: 'Generated from your list. Please check every name, photo and detail, then approve.',
    status: 'pending',
  });
  await changeStatus(null, order, 'proof_sent', { byKind: 'system', note: 'Print sheet generated from your list' });

  job.status = 'ordered';
  job.order = order._id;
  await job.save();
  audit(null, { action: 'bulk.order', entity: 'Order', entityId: order._id, summary: `${order.orderNumber}: ${cards} cards from bulk job ${job.id}` });
  return order;
}
