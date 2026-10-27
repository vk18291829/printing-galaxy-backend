/** Same lists as the API (backend common/permissions.ts). */
export type Permission =
  | 'orders' | 'walkin' | 'proofs' | 'payments' | 'refunds' | 'catalog' | 'marketing'
  | 'reviews' | 'institutions' | 'customers' | 'inventory' | 'reports';

export const STAFF_ROLES = ['manager', 'counter', 'designer', 'production', 'accounts', 'catalogue'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_INFO: Record<StaffRole, { label: string; does: string }> = {
  manager: { label: 'Manager', does: 'Everything except settings, staff and refunds' },
  counter: { label: 'Counter', does: 'Orders, walk-in orders, counter payments, customers' },
  designer: { label: 'Designer', does: 'Orders, proofs, student lists' },
  production: { label: 'Production', does: 'Orders (printing / ready), materials & stock' },
  accounts: { label: 'Accounts', does: 'Payments, refunds, invoices, reports' },
  catalogue: { label: 'Catalogue', does: 'Products, prices, banners, reviews' },
};
