import type { Audience, AuthContext } from '@/common/types';
import { InstitutionModel } from './institution.model';

export interface PricingContext {
  audience: Audience;
  discountPercent: number;
  institutionId?: string;
  institutionStatus?: string;
}

/** Institution prices apply only to approved institution accounts. */
export async function resolvePricingContext(auth?: AuthContext): Promise<PricingContext> {
  if (auth?.kind !== 'institution') return { audience: 'retail', discountPercent: 0 };
  const institution = await InstitutionModel.findById(auth.id).select('status extraDiscountPercent').lean();
  if (institution?.status !== 'approved') {
    return {
      audience: 'retail',
      discountPercent: 0,
      institutionId: auth.id,
      institutionStatus: institution?.status,
    };
  }
  return {
    audience: 'institution',
    discountPercent: institution.extraDiscountPercent ?? 0,
    institutionId: auth.id,
    institutionStatus: institution.status,
  };
}
