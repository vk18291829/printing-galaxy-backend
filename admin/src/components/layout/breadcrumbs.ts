import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { create } from 'zustand';

/** Section names for each URL segment; detail pages add their own label (order number, name…). */
const SEGMENT_LABEL: Record<string, string> = {
  orders: 'Orders',
  products: 'Products & prices',
  categories: 'Categories',
  institutions: 'Institutions',
  customers: 'Customers',
  staff: 'Staff',
  settings: 'Settings',
  audit: 'Audit log',
  reports: 'Reports',
  inventory: 'Materials & stock',
  'bulk-jobs': 'Bulk card lists',
  deliveries: 'Deliveries',
};

const NEW_LABEL: Record<string, string> = { orders: 'Walk-in order', products: 'New product' };

interface CrumbState {
  path: string | null;
  label: string | null;
  set: (path: string | null, label: string | null) => void;
}

const useCrumbStore = create<CrumbState>((set) => ({
  path: null,
  label: null,
  set: (path, label) => set({ path, label }),
}));

/** Lets a detail page name itself in the breadcrumb and the mobile header. */
export function useBreadcrumbLabel(label: string | undefined | null) {
  const { pathname } = useLocation();
  const setCrumb = useCrumbStore((s) => s.set);
  useEffect(() => {
    if (!label) return;
    setCrumb(pathname, label);
    return () => setCrumb(null, null);
  }, [pathname, label, setCrumb]);
}

export interface Crumb {
  label: string;
  to: string;
}

export function useBreadcrumbs(): Crumb[] {
  const { pathname } = useLocation();
  const dynamic = useCrumbStore((s) => (s.path === pathname ? s.label : null));
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [{ label: 'Dashboard', to: '/' }];
  segments.forEach((segment, i) => {
    const to = `/${segments.slice(0, i + 1).join('/')}`;
    const parent = segments[i - 1];
    const isLast = i === segments.length - 1;
    const label =
      SEGMENT_LABEL[segment] ??
      (segment === 'new' && parent ? NEW_LABEL[parent] : undefined) ??
      (isLast ? (dynamic ?? 'Details') : segment);
    crumbs.push({ label, to });
  });
  return crumbs;
}
