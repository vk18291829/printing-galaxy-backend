import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter } from 'react-router';
import { MainLayout } from '@/components/layout/main-layout';
import { PageLoader } from '@/components/common/states';
import { GuestOnly, RequireAuth } from '@/features/auth/guards';
import HomePage from '@/pages/home-page';

const ProductsPage = lazy(() => import('@/pages/products-page'));
const ProductPage = lazy(() => import('@/pages/product-page'));
const PricingPage = lazy(() => import('@/pages/pricing-page'));
const InstitutionsPage = lazy(() => import('@/pages/institutions-page'));
const ContactPage = lazy(() => import('@/pages/contact-page'));
const LoginPage = lazy(() => import('@/pages/auth/login-page'));
const InstitutionLoginPage = lazy(() => import('@/pages/auth/institution-login-page'));
const InstitutionRegisterPage = lazy(() => import('@/pages/auth/institution-register-page'));
const CartPage = lazy(() => import('@/pages/cart-page'));
const CheckoutPage = lazy(() => import('@/pages/checkout-page'));
const OrdersPage = lazy(() => import('@/pages/account/orders-page'));
const OrderDetailPage = lazy(() => import('@/pages/account/order-detail-page'));
const ProfilePage = lazy(() => import('@/pages/account/profile-page'));
const InstitutionDashboardPage = lazy(() => import('@/pages/institution/dashboard-page'));
const TemplatesPage = lazy(() => import('@/pages/institution/templates-page'));
const TemplateEditorPage = lazy(() => import('@/pages/institution/template-editor-page'));
const BulkUploadPage = lazy(() => import('@/pages/institution/bulk-upload-page'));
const BulkJobPage = lazy(() => import('@/pages/institution/bulk-job-page'));
const NotFoundPage = lazy(() => import('@/pages/not-found-page'));
const TrackPage = lazy(() => import('@/pages/track-page'));
const LegalPage = lazy(() => import('@/pages/legal-page'));
const InstitutionPasswordPage = lazy(() => import('@/pages/auth/institution-password-page'));

const page = (node: ReactNode) => <Suspense fallback={<PageLoader />}>{node}</Suspense>;

export const router = createBrowserRouter([
  {
    element: <MainLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'products', element: page(<ProductsPage />) },
      { path: 'products/:slug', element: page(<ProductPage />) },
      { path: 'pricing', element: page(<PricingPage />) },
      { path: 'institutions', element: page(<InstitutionsPage />) },
      { path: 'contact', element: page(<ContactPage />) },
      { path: 'track', element: page(<TrackPage />) },
      { path: 'terms', element: page(<LegalPage kind="terms" />) },
      { path: 'privacy', element: page(<LegalPage kind="privacy" />) },
      { path: 'refund-policy', element: page(<LegalPage kind="refund" />) },
      { path: 'shipping-policy', element: page(<LegalPage kind="shipping" />) },
      { path: 'cart', element: page(<CartPage />) },

      { path: 'login', element: page(<GuestOnly><LoginPage /></GuestOnly>) },
      { path: 'institutions/login', element: page(<GuestOnly><InstitutionLoginPage /></GuestOnly>) },
      { path: 'institutions/register', element: page(<GuestOnly><InstitutionRegisterPage /></GuestOnly>) },
      { path: 'institutions/forgot-password', element: page(<GuestOnly><InstitutionPasswordPage /></GuestOnly>) },

      { path: 'checkout', element: page(<RequireAuth><CheckoutPage /></RequireAuth>) },
      { path: 'account/orders', element: page(<RequireAuth><OrdersPage /></RequireAuth>) },
      { path: 'account/orders/:id', element: page(<RequireAuth><OrderDetailPage /></RequireAuth>) },
      { path: 'account/profile', element: page(<RequireAuth><ProfilePage /></RequireAuth>) },
      { path: 'institution', element: page(<RequireAuth kind="institution"><InstitutionDashboardPage /></RequireAuth>) },
      { path: 'institution/templates', element: page(<RequireAuth kind="institution"><TemplatesPage /></RequireAuth>) },
      { path: 'institution/templates/:id', element: page(<RequireAuth kind="institution"><TemplateEditorPage /></RequireAuth>) },
      { path: 'institution/bulk/new', element: page(<RequireAuth kind="institution"><BulkUploadPage /></RequireAuth>) },
      { path: 'institution/bulk/:id', element: page(<RequireAuth kind="institution"><BulkJobPage /></RequireAuth>) },

      { path: '*', element: page(<NotFoundPage />) },
    ],
  },
]);
