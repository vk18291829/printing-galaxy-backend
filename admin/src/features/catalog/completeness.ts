import type { AdminProduct } from './api';

/** What a product still needs before it looks finished on the website. */
export function missingForProduct(p: AdminProduct) {
  const missing: string[] = [];
  if (!p.images?.length) missing.push('Photo');
  if (!p.shortDescription?.en?.trim()) missing.push('Short description');
  if (!p.description?.en?.trim()) missing.push('Full description');
  if (!p.name?.hi?.trim() || !p.shortDescription?.hi?.trim()) missing.push('Hindi text');
  const retail = p.pricing?.retail;
  const institution = p.pricing?.institution;
  const priced = (b?: { enabled: boolean; tiers: unknown[] }) => !b?.enabled || b.tiers.length > 0;
  if (p.workflow !== 'quote' && (!priced(retail) || !priced(institution))) missing.push('Price tiers');
  if (!retail?.enabled && !institution?.enabled) missing.push('Not sold to anyone');
  return missing;
}
