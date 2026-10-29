import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { enforceSchoolOnlyCatalog } from '@/modules/catalog/audience';
import { CategoryModel } from '@/modules/catalog/category.model';
import { ProductModel } from '@/modules/catalog/product.model';
import { api, bearer, connectTestDb, customerToken, disconnectTestDb, institutionToken, seedBasics } from './helpers';

const L = (en: string) => ({ en, hi: en });
let seed: Awaited<ReturnType<typeof seedBasics>>;

beforeAll(async () => {
  await connectTestDb();
  seed = await seedBasics();
});
afterAll(disconnectTestDb);

describe('school catalogue', () => {
  it('shows institution prices only to approved institutions', async () => {
    const schoolWorks = await CategoryModel.create({ name: L('School Works'), slug: 'school-works', audiences: ['institution'] });
    await ProductModel.updateOne({ _id: seed.products.studentId._id }, { $set: { category: schoolWorks._id } });

    const guest = await api().get('/api/v1/products/student-id-card').expect(200);
    expect(guest.body.pricing.institution).toMatchObject({ enabled: true, tiers: [] });

    const customer = await customerToken('9876543210');
    const asCustomer = await api().get('/api/v1/products?section=institution').set(bearer(customer)).expect(200);
    expect(asCustomer.body.every((p: { pricing: { institution: { tiers: unknown[] } } }) => p.pricing.institution.tiers.length === 0)).toBe(true);

    const pending = await institutionToken('pending@test.in');
    const asPending = await api().get('/api/v1/products/student-id-card').set(bearer(pending)).expect(200);
    expect(asPending.body.pricing.institution.tiers).toEqual([]);

    const school = await institutionToken('school@test.in');
    const asSchool = await api().get('/api/v1/products/student-id-card').set(bearer(school)).expect(200);
    expect(asSchool.body.pricing.institution.tiers.length).toBeGreaterThan(0);
    const browse = await api().get('/api/v1/products/browse?section=institution').set(bearer(school)).expect(200);
    expect(browse.body.items.some((p: { pricing: { institution: { tiers: unknown[] } } }) => p.pricing.institution.tiers.length > 0)).toBe(true);
  });

  it('lists only the school & college range for institutions, not general products offered to them too', async () => {
    const school = await institutionToken('school@test.in');
    // Notes printing has an institution price book in a category open to institutions, but is not a school item.
    const list = await api().get('/api/v1/products?section=institution').set(bearer(school)).expect(200);
    const slugs = list.body.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain('student-id-card');
    expect(slugs).not.toContain('notes-print-bw');
    const browse = await api().get('/api/v1/products/browse?section=institution').expect(200);
    expect(browse.body.items.map((p: { slug: string }) => p.slug)).not.toContain('notes-print-bw');
    // Asking for a general category inside the institution range gives nothing.
    await api().get('/api/v1/products?section=institution&category=printing').expect(200).expect((r) => expect(r.body).toEqual([]));
  });

  it('keeps school categories and their products away from individuals, even when misconfigured', async () => {
    // Misconfigured on purpose: the school category also offered to individuals.
    const schoolWorks = (await CategoryModel.findOneAndUpdate(
      { slug: 'school-works' },
      { $set: { audiences: ['retail', 'institution'] }, $setOnInsert: { name: L('School Works') } },
      { upsert: true, new: true },
    ))!;
    await ProductModel.updateOne({ _id: seed.products.medal._id }, { $set: { category: schoolWorks._id, 'pricing.retail.enabled': true } });

    await enforceSchoolOnlyCatalog();

    expect((await CategoryModel.findById(schoolWorks._id).lean())?.audiences).toEqual(['institution']);
    const medal = await api().get('/api/v1/products/school-medal').expect(200);
    expect(medal.body.pricing.retail).toMatchObject({ enabled: false, tiers: [] });
    const retail = await api().get('/api/v1/products?section=retail').expect(200);
    expect(retail.body.map((p: { slug: string }) => p.slug)).not.toContain('school-medal');
  });
});
