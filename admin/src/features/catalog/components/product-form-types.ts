import type { ProductUnit, ProductWorkflow } from '@/types/api';

interface Localized {
  en: string;
  hi: string;
}

export interface ProductFormValues {
  name: Localized;
  slug: string;
  category: string;
  shortDescription: Localized;
  description: Localized;
  icon: string;
  images: string[];
  videoUrl: string;
  contactPhone: string;
  unit: ProductUnit;
  workflow: ProductWorkflow;
  specsText: string;
  tagsText: string;
  requiresUpload: boolean;
  acceptedFileTypes: string[];
  uploadHint: Localized;
  sensitive: boolean;
  options: {
    key: string;
    label: Localized;
    required: boolean;
    values: {
      value: string;
      label: Localized;
      unitDelta: number;
      fixedFee: number;
      minCopies: number | null;
      isDefault: boolean;
    }[];
  }[];
  pricing: Record<'retail' | 'institution', { enabled: boolean; minQty: number; tiers: { minQty: number; unitPrice: number }[] }>;
  leadTimeDays: number;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
}

export const FILE_TYPES = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'png', 'webp', 'csv', 'xlsx', 'zip'];
