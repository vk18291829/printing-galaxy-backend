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

  it('keeps school categories and their products away from individuals, even when misconfigured', async () => {
    const schoolWorks = await CategoryModel.create({ name: L('School Works'), slug: 'school-works', audiences: ['retail', 'institution'] });
    await ProductModel.updateOne({ _id: seed.products.medal._id }, { $set: { category: schoolWorks._id, 'pricing.retail.enabled': true } });

    await enforceSchoolOnlyCatalog();

    expect((await CategoryModel.findById(schoolWorks._id).lean())?.audiences).toEqual(['institution']);
    const medal = await api().get('/api/v1/products/school-medal').expect(200);
    expect(medal.body.pricing.retail).toMatchObject({ enabled: false, tiers: [] });
    const retail = await api().get('/api/v1/products?section=retail').expect(200);
    expect(retail.body.map((p: { slug: string }) => p.slug)).not.toContain('school-medal');
  });
});
