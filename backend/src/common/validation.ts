import { isValidObjectId } from 'mongoose';
import { z } from 'zod';

export const objectId = z.string().refine((v) => isValidObjectId(v), 'Invalid id');

export const indianPhone = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''))
  .refine((v) => /^[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit mobile number');

export const localized = z.object({
  en: z.string().trim().min(1, 'English text is required'),
  hi: z.string().trim().optional().default(''),
});

export const localizedOptional = z.object({
  en: z.string().trim().optional().default(''),
  hi: z.string().trim().optional().default(''),
});

export const addressInput = z.object({
  label: z.string().trim().max(40).optional(),
  name: z.string().trim().max(80).optional(),
  phone: z.string().trim().max(15).optional(),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a valid 6-digit PIN code'),
});

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export function paginate(page: number, limit: number) {
  return { skip: (page - 1) * limit, limit };
}

export function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
