import { Router } from 'express';
import type { FilterQuery } from 'mongoose';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { objectId, paginate } from '@/common/validation';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { BULK_STATUSES, BulkJobModel, InstitutionTemplateModel, type BulkJob } from './bulk.model';
import { rerunBulkJob } from './bulk.service';
import { sendSamplePdf } from './institution.routes';

export const adminBulkRouter = Router();

const idParams = z.object({ id: objectId });

adminBulkRouter.get(
  '/',
  validate({
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      status: z.enum(BULK_STATUSES).optional(),
      institution: objectId.optional(),
    }),
  }),
  async (_req, res) => {
    const q = res.locals.query as { page: number; limit: number; status?: string; institution?: string };
    const filter: FilterQuery<BulkJob> = {};
    if (q.status) filter.status = q.status;
    if (q.institution) filter.institution = q.institution;
    const { skip, limit } = paginate(q.page, q.limit);
    const [items, total] = await Promise.all([
      BulkJobModel.find(filter)
        .select('-report.errors -report.warnings')
        .populate('institution', 'name')
        .populate('template', 'name kind')
        .populate('order', 'orderNumber status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      BulkJobModel.countDocuments(filter),
    ]);
    res.json({ items, total, page: q.page, pages: Math.ceil(total / limit) });
  },
);

adminBulkRouter.get('/:id', validate({ params: idParams }), async (req, res) => {
  const job = await BulkJobModel.findById(req.params.id)
    .select('+records')
    .populate('institution', 'name phone email status')
    .populate('template')
    .populate('product', 'name slug')
    .populate('order', 'orderNumber status totals')
    .populate('dataFile photosFile output.file', 'originalName size status')
    .lean();
  if (!job) throw ApiError.notFound('Bulk job');
  const { records, ...rest } = job;
  res.json({
    ...rest,
    preview: (records ?? []).slice(0, 50).map((r) => ({ row: r.row, data: r.data, photo: r.photo?.split('/').pop() })),
  });
});

/** Staff re-run a step: after the institution fixes a file, or to rebuild the sheet after a template change. */
adminBulkRouter.post(
  '/:id/rerun',
  validate({ params: idParams, body: z.object({ step: z.enum(['validate', 'generate']) }) }),
  async (req, res) => {
    const job = await BulkJobModel.findById(req.params.id);
    if (!job) throw ApiError.notFound('Bulk job');
    await rerunBulkJob(job, req.body.step);
    audit(req, { action: `bulk.${req.body.step}`, entity: 'BulkJob', entityId: job._id });
    res.json(job);
  },
);

adminBulkRouter.get('/templates/:id/sample', validate({ params: idParams }), async (req, res) => {
  const template = await InstitutionTemplateModel.findById(req.params.id).lean();
  if (!template) throw ApiError.notFound('Template');
  await sendSamplePdf(res, template);
});
