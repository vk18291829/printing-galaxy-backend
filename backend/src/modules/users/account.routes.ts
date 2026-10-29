import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { addressInput, indianPhone, objectId } from '@/common/validation';
import { emailChannel } from '@/config/env';
import { authenticate } from '@/middleware/auth';
import { assertContactAvailable } from '@/modules/auth/unique-contact';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { FileModel } from '@/modules/uploads/file.model';
import { UserModel } from './user.model';

export const accountRouter = Router();
accountRouter.use(authenticate);

const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  phone: indianPhone.optional().or(z.literal('')),
  language: z.enum(['en', 'hi']).optional(),
  offers: z.boolean().optional(),
  addresses: z.array(addressInput).max(5).optional(),
  /** A finished avatar upload of this customer's, or null to remove the photo. */
  avatarFileId: objectId.nullable().optional(),
});

const institutionUpdateSchema = z.object({
  contactName: z.string().trim().min(2).max(80).optional(),
  designation: z.string().trim().max(80).optional(),
  phone: indianPhone.optional(),
  address: addressInput.optional(),
  logoUrl: z.string().url().optional().or(z.literal('')),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

accountRouter.patch('/', async (req, res) => {
  const auth = req.auth!;
  if (auth.kind === 'institution') {
    const input = institutionUpdateSchema.parse(req.body);
    await assertContactAvailable({ phone: input.phone }, { kind: 'institution', id: auth.id });
    const institution = await InstitutionModel.findByIdAndUpdate(auth.id, { $set: input }, { new: true });
    if (!institution) throw ApiError.notFound('Institution');
    res.json({ kind: 'institution', institution: institution.toJSON() });
    return;
  }
  const { avatarFileId, ...input } = userUpdateSchema.parse(req.body);
  // The detail customers sign in with cannot be changed here: email on the email channel, phone on SMS.
  const login = emailChannel() ? 'email' : 'phone';
  delete input[login];
  const update: Record<string, unknown> = { ...input };
  const unset: Record<string, 1> = {};
  for (const key of ['email', 'phone'] as const) {
    if (input[key] === '') {
      delete update[key];
      unset[key] = 1;
    }
  }
  await assertContactAvailable({ email: update.email as string | undefined, phone: update.phone as string | undefined }, { kind: 'user', id: auth.id });

  // Profile photo: only a finished avatar upload this customer made, never an arbitrary address.
  let photo: { _id: unknown; publicUrl?: string | null } | null = null;
  if (avatarFileId) {
    photo = await FileModel.findOne({ _id: avatarFileId, purpose: 'avatar', status: 'uploaded', 'owner.id': auth.id, 'owner.kind': 'user' })
      .select('publicUrl')
      .lean();
    if (!photo?.publicUrl) throw ApiError.badRequest('Upload the photo again');
    update.avatarUrl = photo.publicUrl;
  } else if (avatarFileId === null) {
    unset.avatarUrl = 1;
  }
  const previous = avatarFileId !== undefined ? (await UserModel.findById(auth.id).select('avatarUrl').lean())?.avatarUrl : undefined;
  const user = await UserModel.findByIdAndUpdate(
    auth.id,
    { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { new: true, runValidators: true },
  );
  if (!user) throw ApiError.notFound('User');
  if (photo) await FileModel.updateOne({ _id: photo._id }, { $set: { attachedAt: new Date() } });
  // The photo it replaces goes with the next file clean-up.
  if (previous && previous !== user.avatarUrl) {
    await FileModel.updateOne({ publicUrl: previous, purpose: 'avatar', 'owner.id': auth.id }, { $set: { deleteAfter: new Date() }, $unset: { attachedAt: 1 } });
  }
  res.json({ kind: 'user', user: user.toJSON() });
});
