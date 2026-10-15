import { z } from 'zod';
import { addressInput, objectId } from '@/common/validation';
import { CARD_KINDS, FIELD_KEYS } from './card-kinds';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1D6CF0');

export const templateInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(CARD_KINDS),
  orientation: z.enum(['landscape', 'portrait']).default('landscape'),
  logoFileId: objectId.nullable().optional(),
  colors: z.object({ primary: hex, accent: hex, text: hex }),
  headerText: z.string().trim().max(80).optional().default(''),
  subText: z.string().trim().max(140).optional().default(''),
  fields: z.array(z.enum(FIELD_KEYS)).max(8).default([]),
  backText: z.string().trim().max(400).optional().default(''),
  signatureLabel: z.string().trim().max(40).optional().default('Principal'),
  validUpto: z.string().trim().max(30).optional().default(''),
});

export const bulkJobInput = z.object({
  templateId: objectId,
  productId: objectId.optional(),
  options: z.record(z.string()).default({}),
  dataFileId: objectId,
  photosFileId: objectId.optional(),
});

export const bulkOrderInput = z
  .object({
    fulfilment: z.object({ method: z.enum(['pickup', 'delivery']), address: addressInput.optional() }),
    paymentMethod: z.enum(['online', 'counter']),
    customerNote: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.fulfilment.method === 'pickup' || v.fulfilment.address, {
    message: 'Delivery address is required',
    path: ['fulfilment', 'address'],
  });
