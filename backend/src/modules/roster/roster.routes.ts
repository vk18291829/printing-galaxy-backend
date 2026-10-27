import express, { Router, type Request } from 'express';
import { z } from 'zod';
import { objectId } from '@/common/validation';
import { authenticate, requireKind } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { ApiError } from '@/common/errors';
import { createRefreshToken, hashToken } from '@/modules/auth/tokens';
import { PHOTO_LINK_DAYS, PhotoLinkModel } from './photo-link.model';
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
  renderRosterCards,
  rosterFilter,
  releasePhoto,
  setPhoto,
  storePhoto,
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

  // Photos for an ID card data merge, and ready-to-print card sheets: shop staff only.
  if (staff) {
    router.get('/cards.pdf', validate({ query: kindQuery.extend({ section: z.string().trim().max(40).optional() }) }), async (req, res) => {
      const { kind, class: cls, section } = res.locals.query as z.infer<typeof kindQuery> & { section?: string };
      const people = await PersonModel.find({ ...rosterFilter(institutionOf(req), kind, cls), ...(section ? { section } : {}) });
      const { bytes, sheets } = await renderRosterCards(institutionOf(req), kind, people);
      note(req, 'roster.cards', `ID card PDF: ${people.length} cards on ${sheets} sheets`);
      const name = `${kind === 'staff' ? 'staff' : 'student'}-id-cards${cls ? `-class-${cls}${section ? `-${section}` : ''}` : ''}.pdf`.replace(/[^\w.-]/g, '_');
      res.type('application/pdf').setHeader('Content-Disposition', `attachment; filename="${name}"`).send(Buffer.from(bytes));
    });

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

// Photo links for class teachers (registered before the /:id routes).
const linkInput = z.object({
  kind: z.enum(PERSON_KINDS).default('student'),
  class: z.string().trim().max(40).optional(),
  section: z.string().trim().max(40).optional(),
});

institutionRosterRouter.post('/links', validate({ body: linkInput }), async (req, res) => {
  const input = req.body as z.infer<typeof linkInput>;
  const { token, hash } = createRefreshToken();
  const label = input.kind === 'staff' ? 'All staff' : input.class ? `Class ${input.class}${input.section ? `-${input.section}` : ''}` : 'All students';
  const link = await PhotoLinkModel.create({
    institution: req.auth!.id,
    ...input,
    label,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + PHOTO_LINK_DAYS * 86_400_000),
  });
  res.status(201).json({ ...link.toJSON(), token });
});

institutionRosterRouter.get('/links', async (req, res) => {
  res.json(await PhotoLinkModel.find({ institution: req.auth!.id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean());
});

institutionRosterRouter.delete('/links/:id', validate({ params: z.object({ id: objectId }) }), async (req, res) => {
  await PhotoLinkModel.updateOne({ _id: req.params.id, institution: req.auth!.id }, { $set: { revokedAt: new Date() } });
  res.status(204).end();
});
institutionRosterRouter.use(rosterRoutes((req) => req.auth!.id, { staff: false }));

/** /admin/institutions/:institutionId/roster (mounted after the admin staff check). */
export const adminRosterRouter = Router({ mergeParams: true });
adminRosterRouter.use(validate({ params: z.object({ institutionId: objectId }) }), async (req, _res, next) => {
  if (!(await InstitutionModel.exists({ _id: req.params.institutionId }))) throw ApiError.notFound('Institution');
  next();
});
adminRosterRouter.use(rosterRoutes((req) => req.params.institutionId as string, { staff: true }));

/**
 * /roster-links/:token — no sign-in. A class teacher opens the school's link, sees that class's
 * names and roll numbers (nothing else), and adds photos. Expired or switched-off links stop working.
 */
export const publicRosterLinkRouter = Router();

async function openLink(token: string) {
  const link = await PhotoLinkModel.findOne({ tokenHash: hashToken(token) });
  if (!link || link.revokedAt || link.expiresAt < new Date()) throw ApiError.notFound('This photo link has expired. Ask the school office for a new one.');
  return link;
}

const linkFilter = (link: Awaited<ReturnType<typeof openLink>>) => ({
  institution: link.institution,
  kind: link.kind,
  ...(link.class ? { class: link.class } : {}),
  ...(link.section ? { section: link.section } : {}),
});

publicRosterLinkRouter.get('/:token', validate({ params: z.object({ token: z.string().min(20).max(100) }) }), async (req, res) => {
  const link = await openLink(req.params.token as string);
  const institution = await InstitutionModel.findById(link.institution).select('name').lean();
  const people = await listPeople(String(link.institution), link.kind as PersonKind);
  const filter = linkFilter(link);
  const shown = people.filter((p) => (!filter.class || p.class === filter.class) && (!filter.section || p.section === filter.section));
  res.json({
    institution: institution?.name,
    label: link.label,
    expiresAt: link.expiresAt,
    // Only what a teacher needs to recognise each child.
    items: shown.map((p) => ({ _id: p._id, code: p.code, name: p.name, class: p.class, section: p.section, rollNo: p.rollNo, designation: p.designation, hasPhoto: p.hasPhoto, photoUrl: p.photoUrl })),
  });
});

publicRosterLinkRouter.put(
  '/:token/people/:id/photo',
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '4mb' }),
  validate({ params: z.object({ token: z.string().min(20).max(100), id: objectId }) }),
  async (req, res) => {
    const link = await openLink(req.params.token as string);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw ApiError.badRequest('Send the photo as a JPG, PNG or WEBP image');
    const person = await PersonModel.findOne({ _id: req.params.id, ...linkFilter(link) });
    if (!person) throw ApiError.notFound('Person');
    // Saved as the school's own upload.
    const file = await storePhoto(new Uint8Array(req.body), person.code, { id: String(link.institution), kind: 'institution', role: 'institution' });
    await releasePhoto(person.photo?.file);
    person.set('photo', { file: file._id, source: 'camera', updatedAt: new Date() });
    await person.save();
    await PhotoLinkModel.updateOne({ _id: link._id }, { $inc: { photosTaken: 1 } });
    res.json({ _id: person._id, hasPhoto: true });
  },
);
