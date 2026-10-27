import { ApiError } from '@/common/errors';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { UserModel } from '@/modules/users/user.model';

/**
 * One phone number or email belongs to one account only: across customers, staff and
 * institutions. `self` is the account being edited, so its own details don't count as taken.
 */
export async function assertContactAvailable(
  contact: { email?: string | null; phone?: string | null },
  self?: { kind: 'user' | 'institution'; id: string },
) {
  for (const key of ['email', 'phone'] as const) {
    const value = contact[key];
    if (!value) continue;
    const [user, institution] = await Promise.all([
      UserModel.exists({ [key]: value, ...(self?.kind === 'user' && { _id: { $ne: self.id } }) }),
      InstitutionModel.exists({ [key]: value, ...(self?.kind === 'institution' && { _id: { $ne: self.id } }) }),
    ]);
    if (user || institution) {
      throw ApiError.conflict(
        key === 'email' ? 'This email is already registered with another account' : 'This mobile number is already registered with another account',
      );
    }
  }
}
