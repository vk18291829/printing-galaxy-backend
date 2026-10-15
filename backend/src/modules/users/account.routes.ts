import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { addressInput, indianPhone } from '@/common/validation';
import { authenticate } from '@/middleware/auth';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { UserModel } from './user.model';

export const accountRouter = Router();
accountRouter.use(authenticate);

const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  language: z.enum(['en', 'hi']).optional(),
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
    const institution = await InstitutionModel.findByIdAndUpdate(auth.id, { $set: input }, { new: true });
    if (!institution) throw ApiError.notFound('Institution');
    res.json({ kind: 'institution', institution: institution.toJSON() });
    return;
  }
  const input = userUpdateSchema.parse(req.body);
  const update: Record<string, unknown> = { ...input };
  if (input.email === '') {
    delete update.email;
  }
  const user = await UserModel.findByIdAndUpdate(
    auth.id,
    { $set: update, ...(input.email === '' ? { $unset: { email: 1 } } : {}) },
    { new: true, runValidators: true },
  );
  if (!user) throw ApiError.notFound('User');
  res.json({ kind: 'user', user: user.toJSON() });
});
