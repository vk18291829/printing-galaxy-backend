import { z } from 'zod';
import { addressInput, indianPhone } from '@/common/validation';
import { INSTITUTION_TYPES } from '@/modules/institutions/institution.model';

/** Site language, so codes and the welcome email arrive in English or Hindi. */
const lang = z.enum(['en', 'hi']).optional();

/** Email or mobile number, whichever MESSAGING_CHANNEL signs customers in with. */
export const otpRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').optional(),
  phone: indianPhone.optional(),
  lang,
});

export const otpVerifySchema = otpRequestSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  name: z.string().trim().max(80).optional(),
});

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

export const institutionRegisterSchema = z.object({
  name: z.string().trim().min(3).max(150),
  type: z.enum(INSTITUTION_TYPES),
  contactName: z.string().trim().min(2).max(80),
  designation: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email(),
  phone: indianPhone,
  password,
  address: addressInput,
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid GSTIN')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  size: z.coerce.number().int().min(0).max(1_000_000).optional(),
  lang,
});

export const passwordLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Enter your password'),
});

export const passwordForgotSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  lang,
});

export const passwordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  password,
});

export { password as passwordSchema };
