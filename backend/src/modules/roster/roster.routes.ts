import { Router, type Request } from 'express';
import { z } from 'zod';
import { objectId } from '@/common/validation';
import { authenticate, requireKind } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { ApiError } from '@/common/errors';
import { PERSON_KINDS, PersonModel, ROSTER_FIELDS, type PersonKind, type RosterField } from './roster.model';
import {
  cleanFields,
  createPerson,
  deletePerson,
  exportPhotosZip,
  exportXlsx,
  findPerson,
  importSheet,
  listPeople,
  removePhoto,
  rosterFilter,
  setPhoto,
} from './roster.service';

const field = z.string().trim().max(200);
const personFields = z.object(
  Object.fromEntries(ROSTER_FIELDS.map((f) => [f, f === 'name' ? z.string().trim().min(1, 'Enter the name').max(120) : field.optional()])) as unknown as Record<RosterField, z.ZodTypeAny>,
);
const kindQuery = z.object({ kind: z.enum(PERSON_KINDS).default('student'), class: z.string().trim().max(40).optional() });
const createSchema = personFields.extend({ kind: z.enum(PERSON_KINDS).default('student') });
// passthrough keeps :institutionId on the admin routes.
const idParams = z.object({ id: objectId }).passthrough();

/**
 * One set of roster routes for both sides: the institution manages its own list
 * (/institution/roster) and shop staff manage any institution's (/admin/institutions/:institutionId/roster).
 */
function rosterRoutes(institutionOf: (req: Request) => string, { staff }: { staff: boolean }) {
  const router = Router({ mergeParams: true });
  const note = (req: Request, action: string, summary: string, entityId?: unknown) =>
    staff && audit(req, { action, entity: 'Institution', entityId: institutionOf(req) as never, summary, changes: entityId ? { person: String(entityId) } : undefined });

  router.get('/', validate({ query: kindQuery }), async (req, res) => {
    const { kind } = res.locals.query as z.infer<typeof kindQuery>;
    const items = await listPeople(institutionOf(req), kind);
    res.json({ items, total: items.length, withPhoto: items.filter((p) => p.hasPhoto).length });
  });

  router.post('/', validate({ body: createSchema }), async (req, res) => {
    const { kind, ...fields } = req.body as z.infer<typeof createSchema> & Record<RosterField, string>;
    const person = await createPerson(institutionOf(req), kind, fields, req.auth!);
    note(req, 'roster.add', `Added ${person.code} ${person.name}`, person._id);
    res.status(201).json(person.toJSON());
  });

  router.post(
    '/import',
    validate({ body: z.object({ kind: z.enum(PERSON_KINDS).default('student'), fileId: objectId, photosFileId: objectId.optional() }) }),
    async (req, res) => {
      const { kind, ...input } = req.body as { kind: PersonKind; fileId: string; photosFileId?: string };
      const result = await importSheet(institutionOf(req), kind, input, req.auth!);
      note(req, 'roster.import', `Imported ${result.created} new, ${result.updated} updated, ${result.photos} photos`);
      res.json(result);
    },
  );

  router.get('/export.xlsx', validate({ query: kindQuery }), async (req, res) => {
    const { kind, class: cls } = res.locals.query as z.infer<typeof kindQuery>;
    const people = await PersonModel.find(rosterFilter(institutionOf(req), kind, cls)).lean();
    const name = `${kind === 'staff' ? 'staff' : 'students'}${cls ? `-class-${cls}` : ''}.xlsx`.replace(/[^\w.-]/g, '_');
    res
      .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .setHeader('Content-Disposition', `attachment; filename="${name}"`)
      .send(await exportXlsx(people as never, kind));
  });

  // Photos for an ID card data merge: shop staff only.
  if (staff) {
    router.get('/photos.zip', validate({ query: kindQuery }), async (req, res) => {
      const { kind, class: cls } = res.locals.query as z.infer<typeof kindQuery>;
      const people = await PersonModel.find(rosterFilter(institutionOf(req), kind, cls));
      res
        .type('application/zip')
        .setHeader('Content-Disposition', `attachment; filename="${kind}-photos${cls ? `-class-${cls}` : ''}.zip"`.replace(/[^\w.\-"=; ]/g, '_'))
        .send(await exportPhotosZip(people));
    });
  }

  router.patch('/:id', validate({ params: idParams, body: personFields.partial() }), async (req, res) => {
    const person = await findPerson(institutionOf(req), req.params.id as string);
    person.set(cleanFields(req.body as Partial<Record<RosterField, string>>));
    await person.save();
    note(req, 'roster.edit', `Edited ${person.code} ${person.name}`, person._id);
    res.json(person.toJSON());
  });

  router.delete('/:id', validate({ params: idParams }), async (req, res) => {
    const person = await findPerson(institutionOf(req), req.params.id as string);
    await deletePerson(person);
    note(req, 'roster.remove', `Removed ${person.code} ${person.name}`, person._id);
    res.status(204).end();
  });

  router.put(
    '/:id/photo',
    validate({ params: idParams, body: z.object({ fileId: objectId, source: z.enum(['upload', 'camera']).default('upload') }) }),
    async (req, res) => {
      const person = await findPerson(institutionOf(req), req.params.id as string);
      await setPhoto(person, req.body.fileId, req.body.source, req.auth!);
      note(req, 'roster.photo', `Photo for ${person.code} ${person.name}`, person._id);
      res.json(person.toJSON());
    },
  );

  router.delete('/:id/photo', validate({ params: idParams }), async (req, res) => {
    const person = await findPerson(institutionOf(req), req.params.id as string);
    await removePhoto(person);
    res.json(person.toJSON());
  });

  return router;
}

/** /institution/roster */
export const institutionRosterRouter = Router();
institutionRosterRouter.use(authenticate, requireKind('institution'));
institutionRosterRouter.use(rosterRoutes((req) => req.auth!.id, { staff: false }));

/** /admin/institutions/:institutionId/roster (mounted after the admin staff check). */
export const adminRosterRouter = Router({ mergeParams: true });
adminRosterRouter.use(validate({ params: z.object({ institutionId: objectId }) }), async (req, _res, next) => {
  if (!(await InstitutionModel.exists({ _id: req.params.institutionId }))) throw ApiError.notFound('Institution');
  next();
});
adminRosterRouter.use(rosterRoutes((req) => req.params.institutionId as string, { staff: true }));
