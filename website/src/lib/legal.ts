export type LegalKind = 'terms' | 'privacy' | 'refund' | 'shipping';

/** Policy pages linked from the footer and from each other. */
export const LEGAL_PAGES: { kind: LegalKind; path: string }[] = [
  { kind: 'terms', path: '/terms' },
  { kind: 'privacy', path: '/privacy' },
  { kind: 'refund', path: '/refund-policy' },
  { kind: 'shipping', path: '/shipping-policy' },
];
