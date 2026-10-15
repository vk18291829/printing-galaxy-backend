import type { Audience, LocalizedString } from '@/common/types';
import type { Product } from '@/modules/catalog/product.model';

export interface QuoteInput {
  options?: Record<string, string>;
  /** Used for non page-based products. */
  quantity?: number;
  /** Used for page-based products. */
  pageCount?: number;
  copies?: number;
}

export type QuoteErrorCode =
  | 'NOT_AVAILABLE'
  | 'OPTION_REQUIRED'
  | 'OPTION_INVALID'
  | 'MIN_QTY'
  | 'MIN_COPIES'
  | 'PAGE_COUNT_REQUIRED';

export interface QuoteError {
  code: QuoteErrorCode;
  message: string;
  params?: Record<string, string | number>;
}

export interface SelectedOption {
  key: string;
  label: LocalizedString;
  value: string;
  valueLabel: LocalizedString;
  unitDelta: number;
  fixedFee: number;
}

export interface Quote {
  audience: Audience;
  unit: string;
  units: number;
  quantity: number;
  copies: number;
  pageCount: number | null;
  minQty: number;
  minCopies: number;
  tierUnitPrice: number;
  optionUnitDelta: number;
  unitPrice: number;
  fixedFeePerCopy: number;
  fixedFees: number;
  discountPercent: number;
  discount: number;
  subtotal: number;
  nextTier: { minQty: number; unitPrice: number } | null;
  selectedOptions: SelectedOption[];
  requiresQuote: boolean;
  valid: boolean;
  errors: QuoteError[];
}

type PricedProduct = Pick<Product, 'unit' | 'workflow' | 'options' | 'pricing'>;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function findTier(tiers: { minQty: number; unitPrice: number }[], units: number) {
  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);
  let current = sorted[0] ?? null;
  let next: (typeof sorted)[number] | null = null;
  for (const tier of sorted) {
    if (units >= tier.minQty) current = tier;
    else {
      next = tier;
      break;
    }
  }
  return { current, next };
}

/**
 * Prices one line item from the product's price book for the given audience.
 * This is the single source of truth: the website preview and order creation both call it.
 */
export function quoteProduct(
  product: PricedProduct,
  audience: Audience,
  input: QuoteInput,
  discountPercent = 0,
): Quote {
  const errors: QuoteError[] = [];
  const book = product.pricing?.[audience];
  const isPageBased = product.unit === 'page';
  const requiresQuote = product.workflow === 'quote';

  const copies = Math.max(1, Math.floor(input.copies ?? 1));
  const pageCount = isPageBased ? Math.max(0, Math.floor(input.pageCount ?? 0)) : null;
  const quantity = isPageBased ? copies : Math.max(0, Math.floor(input.quantity ?? 0));
  const units = isPageBased ? (pageCount ?? 0) * copies : quantity;

  if (!book?.enabled) {
    errors.push({
      code: 'NOT_AVAILABLE',
      message: `This product is not available for ${audience === 'institution' ? 'institutions' : 'individual'} orders`,
    });
  }

  // Resolve options
  const selectedOptions: SelectedOption[] = [];
  let minCopies = 1;
  for (const option of product.options ?? []) {
    const chosen = input.options?.[option.key] ?? option.values.find((v) => v.isDefault)?.value;
    if (!chosen) {
      if (option.required) {
        errors.push({
          code: 'OPTION_REQUIRED',
          message: `Please choose ${option.label.en}`,
          params: { option: option.key },
        });
      }
      continue;
    }
    const value = option.values.find((v) => v.value === chosen);
    if (!value) {
      errors.push({
        code: 'OPTION_INVALID',
        message: `Invalid choice for ${option.label.en}`,
        params: { option: option.key },
      });
      continue;
    }
    if (value.minCopies && value.minCopies > minCopies) minCopies = value.minCopies;
    selectedOptions.push({
      key: option.key,
      label: option.label,
      value: value.value,
      valueLabel: value.label,
      unitDelta: value.unitDelta ?? 0,
      fixedFee: value.fixedFee ?? 0,
    });
  }

  const minQty = book?.minQty ?? 1;

  if (isPageBased && !pageCount) {
    errors.push({ code: 'PAGE_COUNT_REQUIRED', message: 'Enter the number of pages' });
  } else if (units < minQty) {
    errors.push({
      code: 'MIN_QTY',
      message: `Minimum order is ${minQty} ${product.unit}${minQty > 1 ? 's' : ''}`,
      params: { min: minQty, unit: product.unit },
    });
  }

  if (copies < minCopies) {
    errors.push({
      code: 'MIN_COPIES',
      message: `Minimum ${minCopies} copies for the selected options`,
      params: { min: minCopies },
    });
  }

  const tiers = book?.tiers ?? [];
  if (!requiresQuote && book?.enabled && tiers.length === 0) {
    errors.push({ code: 'NOT_AVAILABLE', message: 'Price is not set for this product yet' });
  }

  const { current, next } = findTier(tiers, Math.max(units, 1));
  const tierUnitPrice = current?.unitPrice ?? 0;
  const optionUnitDelta = selectedOptions.reduce((sum, o) => sum + o.unitDelta, 0);
  const unitPrice = Math.max(0, tierUnitPrice + optionUnitDelta);
  const fixedFeePerCopy = selectedOptions.reduce((sum, o) => sum + o.fixedFee, 0);
  const fixedFees = fixedFeePerCopy * copies;
  const gross = unitPrice * units + fixedFees;
  const discount = round2((gross * Math.min(Math.max(discountPercent, 0), 50)) / 100);
  const subtotal = round2(gross - discount);

  return {
    audience,
    unit: product.unit,
    units,
    quantity,
    copies,
    pageCount,
    minQty,
    minCopies,
    tierUnitPrice: round2(tierUnitPrice),
    optionUnitDelta: round2(optionUnitDelta),
    unitPrice: round2(unitPrice),
    fixedFeePerCopy: round2(fixedFeePerCopy),
    fixedFees: round2(fixedFees),
    discountPercent,
    discount,
    subtotal,
    nextTier: next ? { minQty: next.minQty, unitPrice: round2(next.unitPrice + optionUnitDelta) } : null,
    selectedOptions,
    requiresQuote,
    valid: errors.length === 0,
    errors,
  };
}
