import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { addressInput, indianPhone } from '@/common/validation';
import { emailChannel } from '@/config/env';
import { authenticate } from '@/middleware/auth';
import { assertContactAvailable } from '@/modules/auth/unique-contact';
import { InstitutionModel } from '@/modules/institutions/institution.model';
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
  const input = userUpdateSchema.parse(req.body);
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
  const user = await UserModel.findByIdAndUpdate(
    auth.id,
    { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { new: true, runValidators: true },
  );
  if (!user) throw ApiError.notFound('User');
  res.json({ kind: 'user', user: user.toJSON() });
});
