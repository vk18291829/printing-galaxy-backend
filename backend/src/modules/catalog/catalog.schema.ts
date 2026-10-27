import { z } from 'zod';
import { AUDIENCES } from '@/common/types';
import { localized, localizedOptional, objectId } from '@/common/validation';
import { PRODUCT_UNITS, PRODUCT_WORKFLOWS } from './product.model';

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes only');

export const categoryInputSchema = z.object({
  name: localized,
  slug,
  description: localizedOptional.optional(),
  icon: z.string().trim().max(60).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  audiences: z.array(z.enum(AUDIENCES)).min(1).default([...AUDIENCES]),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

const tierSchema = z.object({
  minQty: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
});

const priceBookSchema = z
  .object({
    enabled: z.boolean().default(true),
    minQty: z.coerce.number().int().min(1).default(1),
    tiers: z.array(tierSchema).default([]),
  })
  .refine((b) => new Set(b.tiers.map((t) => t.minQty)).size === b.tiers.length, {
    message: 'Each price tier must have a different minimum quantity',
  });

const optionValueSchema = z.object({
  value: z.string().trim().min(1).max(60),
  label: localized,
  unitDelta: z.coerce.number().default(0),
  fixedFee: z.coerce.number().min(0).default(0),
  minCopies: z.coerce.number().int().min(1).optional().nullable().transform((v) => v ?? undefined),
  isDefault: z.boolean().default(false),
});

const optionSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-zA-Z0-9_]*$/, 'Option key must be camelCase letters'),
  label: localized,
  required: z.boolean().default(true),
  values: z.array(optionValueSchema).min(1, 'Add at least one choice'),
});

export const productInputSchema = z.object({
  name: localized,
  slug,
  category: objectId,
  shortDescription: localizedOptional.optional(),
  description: localizedOptional.optional(),
  images: z.array(z.string().url()).max(5, 'Up to 5 images per product').default([]),
  icon: z.string().trim().max(60).optional(),
  unit: z.enum(PRODUCT_UNITS),
  workflow: z.enum(PRODUCT_WORKFLOWS),
  specs: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  requiresUpload: z.boolean().default(false),
  acceptedFileTypes: z.array(z.string().trim().toLowerCase()).default(['pdf', 'jpg', 'png']),
  uploadHint: localizedOptional.optional(),
  sensitive: z.boolean().default(false),
  options: z.array(optionSchema).default([]),
  pricing: z.object({ retail: priceBookSchema, institution: priceBookSchema }),
  leadTimeDays: z.coerce.number().int().min(0).max(60).default(1),
  tags: z.array(z.string().trim()).default([]),
  isFeatured: z.boolean().default(false),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().default(0),
});

export const productListQuery = z.object({
  category: z.string().trim().optional(),
  audience: z.enum(AUDIENCES).optional(),
  /** Which catalogue: only products in categories offered to this audience. */
  section: z.enum(AUDIENCES).optional(),
  excludeCategory: z.string().trim().optional(),
  featured: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  q: z.string().trim().max(100).optional(),
});

export const PRODUCT_SORTS = ['popular', 'newest', 'price-asc', 'price-desc', 'rating'] as const;

export const productBrowseQuery = z.object({
  category: z.string().trim().optional(),
  audience: z.enum(AUDIENCES).default('retail'),
  section: z.enum(AUDIENCES).optional(),
  excludeCategory: z.string().trim().optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(PRODUCT_SORTS).default('popular'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(12),
});
