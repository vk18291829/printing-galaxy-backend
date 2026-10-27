import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Link } from 'react-router';
import { PageLoader } from '@/components/common/states';
import { AdminLayout } from '@/components/layout/admin-layout';
import { Button } from '@/components/ui/button';
import { RequireAdmin, RequireStaff } from '@/features/auth/guards';
import LoginPage from '@/pages/login-page';

const DashboardPage = lazy(() => import('@/pages/dashboard-page'));
const OrdersPage = lazy(() => import('@/pages/orders/orders-page'));
const MyWorkPage = lazy(() => import('@/pages/orders/my-work-page'));
const OrderDetailPage = lazy(() => import('@/pages/orders/order-detail-page'));
const WalkInPage = lazy(() => import('@/pages/orders/walk-in-page'));
const ProductsPage = lazy(() => import('@/pages/catalog/products-page'));
const ProductFormPage = lazy(() => import('@/pages/catalog/product-form-page'));
const CategoriesPage = lazy(() => import('@/pages/catalog/categories-page'));
const InstitutionsPage = lazy(() => import('@/pages/institutions/institutions-page'));
const InstitutionDetailPage = lazy(() => import('@/pages/institutions/institution-detail-page'));
const InstitutionRosterPage = lazy(() => import('@/pages/institutions/institution-roster-page'));
const CustomersPage = lazy(() => import('@/pages/people/customers-page'));
const StaffPage = lazy(() => import('@/pages/people/staff-page'));
const SettingsPage = lazy(() => import('@/pages/system/settings-page'));
const AuditPage = lazy(() => import('@/pages/system/audit-page'));
const SystemPage = lazy(() => import('@/pages/system/system-page'));
const InventoryPage = lazy(() => import('@/pages/system/inventory-page'));
const ReportsPage = lazy(() => import('@/pages/system/reports-page'));
const BulkJobsPage = lazy(() => import('@/pages/bulk/bulk-jobs-page'));
const BulkJobDetailPage = lazy(() => import('@/pages/bulk/bulk-job-detail-page'));
const DeliveriesPage = lazy(() => import('@/pages/delivery/deliveries-page'));
const ReviewsPage = lazy(() => import('@/pages/reviews/reviews-page'));
const BannersPage = lazy(() => import('@/pages/marketing/banners-page'));
const PromotionsPage = lazy(() => import('@/pages/marketing/promotions-page'));

const page = (node: ReactNode, adminOnly = false) => (
  <Suspense fallback={<PageLoader />}>{adminOnly ? <RequireAdmin>{node}</RequireAdmin> : node}</Suspense>
);

function NotFound() {
  return (
    <div className="grid min-h-[50vh] place-items-center text-center">
      <div>
        <p className="text-5xl font-bold text-brand-gradient">404</p>
        <p className="mt-2 text-muted-foreground">This page doesn't exist.</p>
        <Button className="mt-4" asChild>
          <Link to="/">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireStaff>
        <AdminLayout />
      </RequireStaff>
    ),
    children: [
      { index: true, element: page(<DashboardPage />) },
      { path: 'orders', element: page(<OrdersPage />) },
      { path: 'my-work', element: page(<MyWorkPage />) },
      { path: 'orders/new', element: page(<WalkInPage />) },
      { path: 'orders/:id', element: page(<OrderDetailPage />) },
      { path: 'products', element: page(<ProductsPage />, true) },
      { path: 'products/new', element: page(<ProductFormPage />, true) },
      { path: 'products/:id', element: page(<ProductFormPage />, true) },
      { path: 'categories', element: page(<CategoriesPage />, true) },
      { path: 'reviews', element: page(<ReviewsPage />) },
      { path: 'banners', element: page(<BannersPage />, true) },
      { path: 'promotions', element: page(<PromotionsPage />, true) },
      { path: 'institutions', element: page(<InstitutionsPage />) },
      { path: 'institutions/:id', element: page(<InstitutionDetailPage />) },
      { path: 'institutions/:id/students', element: page(<InstitutionRosterPage />) },
      { path: 'customers', element: page(<CustomersPage />) },
      { path: 'staff', element: page(<StaffPage />, true) },
      { path: 'settings', element: page(<SettingsPage />, true) },
      { path: 'audit', element: page(<AuditPage />, true) },
      { path: 'system', element: page(<SystemPage />, true) },
      { path: 'reports', element: page(<ReportsPage />, true) },
      { path: 'inventory', element: page(<InventoryPage />) },
      { path: 'bulk-jobs', element: page(<BulkJobsPage />) },
      { path: 'bulk-jobs/:id', element: page(<BulkJobDetailPage />) },
      { path: 'deliveries', element: page(<DeliveriesPage />) },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
