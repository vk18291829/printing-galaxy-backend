import type { LocalizedString } from '@/types/api';

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export function formatINR(value: number) {
  return inr.format(value);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** GST already inside the prices (the total is not raised by it). */
export const taxIncluded = (t: { subtotal: number; deliveryFee: number; tax: number; total: number }) =>
  t.tax > 0 && Math.abs(t.total - (t.subtotal + t.deliveryFee)) < 0.01;

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-IN').format(value);
}

export function formatDate(value: string | Date, lang = 'en', withTime = false) {
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(value));
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function pickLocale(value: LocalizedString | undefined | null, lang: string) {
  if (!value) return '';
  return (lang === 'hi' ? value.hi : value.en) || value.en || '';
}
