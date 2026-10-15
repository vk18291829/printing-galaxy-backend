import { Router, type Response } from 'express';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { objectId } from '@/common/validation';
import { authenticate, requireKind } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { FileModel } from '@/modules/uploads/file.model';
import { renderCardSheets } from './card-renderer';
import { allowedFields, CARD_KINDS, FIELD_LABELS, KIND_SPECS, type CardKind } from './card-kinds';
import { BulkJobModel, InstitutionTemplateModel, type InstitutionTemplate } from './bulk.model';
import { bulkJobInput, bulkOrderInput, templateInput } from './bulk.schema';
import { createBulkJob, loadLogo, placeBulkOrder, toCardTemplate } from './bulk.service';
import { SAMPLE_RECORDS } from './sample-data';

/** Institution self-service: saved card templates and bulk list uploads. */
export const institutionRouter = Router();
institutionRouter.use(authenticate, requireKind('institution'));

const idParams = z.object({ id: objectId });

institutionRouter.get('/card-kinds', (_req, res) => {
  res.json(
    CARD_KINDS.map((kind) => ({
      kind,
      ...KIND_SPECS[kind],
      allowedFields: allowedFields(kind).map((key) => ({ key, label: FIELD_LABELS[key] })),
    })),
  );
});

// ── Templates ───────────────────────────────────────────────────────────────
async function resolveLogo(institutionId: string, logoFileId: string | null | undefined) {
  if (logoFileId === undefined) return {};
  if (logoFileId === null) return { logo: undefined, logoUrl: undefined };
  const file = await FileModel.findOne({ _id: logoFileId, 'owner.id': institutionId, purpose: 'logo', status: 'uploaded' });
  if (!file) throw ApiError.badRequest('Upload the logo again');
  if (!file.mimeType.startsWith('image/')) throw ApiError.badRequest('The logo must be a JPG, PNG or WEBP image');
  return { logo: file._id, logoUrl: file.publicUrl };
}

function checkFields(kind: CardKind, fields: string[]) {
  const allowed = allowedFields(kind) as string[];
  const bad = fields.filter((f) => !allowed.includes(f));
  if (bad.length) throw ApiError.unprocessable(`${bad.join(', ')} cannot be printed on a ${KIND_SPECS[kind].label}`);
}

institutionRouter.get('/templates', async (req, res) => {
  res.json(await InstitutionTemplateModel.find({ institution: req.auth!.id, isActive: true }).sort({ updatedAt: -1 }).lean());
});

institutionRouter.post('/templates', validate({ body: templateInput }), async (req, res) => {
  const { logoFileId, ...input } = req.body as z.infer<typeof templateInput>;
  checkFields(input.kind, input.fields);
  const template = await InstitutionTemplateModel.create({
    ...input,
    fields: input.fields.length ? input.fields : KIND_SPECS[input.kind].defaultFields,
    ...(await resolveLogo(req.auth!.id, logoFileId)),
    institution: req.auth!.id,
  });
  audit(req, { action: 'template.create', entity: 'InstitutionTemplate', entityId: template._id, summary: template.name });
  res.status(201).json(template);
});

institutionRouter.patch('/templates/:id', validate({ params: idParams, body: templateInput }), async (req, res) => {
  const template = await InstitutionTemplateModel.findOne({ _id: req.params.id, institution: req.auth!.id, isActive: true });
  if (!template) throw ApiError.notFound('Template');
  const { logoFileId, ...input } = req.body as z.infer<typeof templateInput>;
  checkFields(input.kind, input.fields);
  template.set({ ...input, ...(await resolveLogo(req.auth!.id, logoFileId)) });
  await template.save();
  res.json(template);
});

institutionRouter.delete('/templates/:id', validate({ params: idParams }), async (req, res) => {
  const template = await InstitutionTemplateModel.findOne({ _id: req.params.id, institution: req.auth!.id });
  if (!template) throw ApiError.notFound('Template');
  // Past jobs still reference it, so it is hidden rather than deleted.
  template.isActive = false;
  await template.save();
  res.status(204).end();
});

export async function sendSamplePdf(res: Response, template: InstitutionTemplate) {
  const cardTemplate = await toCardTemplate(template);
  const { bytes } = await renderCardSheets({
    template: cardTemplate,
    records: SAMPLE_RECORDS[cardTemplate.kind].map((data) => ({ data })),
    logo: await loadLogo(template),
    title: `Sample - ${cardTemplate.headerText}`,
  });
  res.type('application/pdf').setHeader('Content-Disposition', 'inline; filename="template-sample.pdf"').send(Buffer.from(bytes));
}

/** A real print-sheet PDF with dummy people, to check the design before uploading a list. */
institutionRouter.get('/templates/:id/sample', validate({ params: idParams }), async (req, res) => {
  const template = await InstitutionTemplateModel.findOne({ _id: req.params.id, institution: req.auth!.id }).lean();
  if (!template) throw ApiError.notFound('Template');
  await sendSamplePdf(res, template);
});

// ── Bulk jobs ───────────────────────────────────────────────────────────────
institutionRouter.get('/bulk-jobs', async (req, res) => {
  const jobs = await BulkJobModel.find({ institution: req.auth!.id })
    .select('-report.errors -report.warnings')
    .populate('template', 'name kind')
    .populate('order', 'orderNumber status')
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json(jobs);
});

institutionRouter.get('/bulk-jobs/:id', validate({ params: idParams }), async (req, res) => {
  const job = await BulkJobModel.findOne({ _id: req.params.id, institution: req.auth!.id })
    .select('+records')
    .populate('template', 'name kind orientation')
    .populate('product', 'name slug pricing unit')
    .populate('order', 'orderNumber status totals')
    .populate('dataFile photosFile', 'originalName size')
    .lean();
  if (!job) throw ApiError.notFound('Upload');
  const { records, ...rest } = job;
  // The first rows are enough for the "this is what we read" preview.
  res.json({
    ...rest,
    preview: (records ?? []).slice(0, 25).map((r) => ({ row: r.row, data: r.data, photo: r.photo?.split('/').pop() })),
  });
});

institutionRouter.post('/bulk-jobs', validate({ body: bulkJobInput }), async (req, res) => {
  const job = await createBulkJob(req.auth!, req.body as z.infer<typeof bulkJobInput>);
  audit(req, { action: 'bulk.create', entity: 'BulkJob', entityId: job._id, summary: `${job.kind} list uploaded` });
  res.status(201).json(job);
});

institutionRouter.post('/bulk-jobs/:id/order', validate({ params: idParams, body: bulkOrderInput }), async (req, res) => {
  const job = await BulkJobModel.findOne({ _id: req.params.id, institution: req.auth!.id });
  if (!job) throw ApiError.notFound('Upload');
  const order = await placeBulkOrder(req.auth!, job, req.body as z.infer<typeof bulkOrderInput>);
  res.status(201).json(order.toJSON());
});
