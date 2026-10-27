/**
 * Staff permissions. A staff member holds one or more job roles; each role grants permissions,
 * and routes check permissions (never role names). The owner (`admin`) has every permission plus
 * the owner-only areas: settings, staff, audit log and system.
 */
export const PERMISSIONS = [
  'orders', // see and work orders: status, assign, notes, ready-by dates, quotes
  'walkin', // create counter (walk-in) orders
  'proofs', // send design proofs
  'payments', // record counter payments, invoices
  'refunds', // send money back
  'catalog', // products, prices, categories
  'marketing', // banners, offers, promotions
  'reviews', // moderate ratings
  'institutions', // approve institutions, student & staff lists
  'customers', // customer accounts
  'inventory', // materials and stock
  'reports', // sales and business reports
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const STAFF_ROLE_KEYS = ['manager', 'counter', 'designer', 'production', 'accounts', 'catalogue'] as const;
export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[number];

export const ROLE_PERMISSIONS: Record<StaffRoleKey, Permission[]> = {
  manager: ['orders', 'walkin', 'proofs', 'payments', 'catalog', 'marketing', 'reviews', 'institutions', 'customers', 'inventory', 'reports'],
  counter: ['orders', 'walkin', 'payments', 'customers'],
  designer: ['orders', 'proofs', 'institutions'],
  production: ['orders', 'inventory'],
  accounts: ['orders', 'payments', 'refunds', 'reports'],
  catalogue: ['catalog', 'marketing', 'reviews'],
};

/** Staff accounts created before roles existed keep what plain "staff" could always do. */
const LEGACY_STAFF: StaffRoleKey[] = ['counter', 'designer'];

export function permissionsFor(role: string, staffRoles?: readonly string[] | null): Permission[] {
  if (role === 'admin') return [...PERMISSIONS];
  if (role !== 'staff') return [];
  const roles = (staffRoles?.length ? staffRoles : LEGACY_STAFF) as StaffRoleKey[];
  return [...new Set(roles.flatMap((r) => ROLE_PERMISSIONS[r] ?? []))];
}
