import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { MainLayout } from '@/components/layout/main-layout';
import { PageLoader } from '@/components/common/states';
import { GuestOnly, InstitutionLoginRedirect, RequireAuth } from '@/features/auth/guards';
import HomePage from '@/pages/home-page';

const ProductsPage = lazy(() => import('@/pages/products-page'));
const ProductPage = lazy(() => import('@/pages/product-page'));
const InstitutionsPage = lazy(() => import('@/pages/institutions-page'));
const BusinessPrintingPage = lazy(() => import('@/pages/business-printing-page'));
const WeddingCardsPage = lazy(() => import('@/pages/wedding-cards-page'));
const ContactPage = lazy(() => import('@/pages/contact-page'));
const LoginPage = lazy(() => import('@/pages/auth/login-page'));
const InstitutionRegisterPage = lazy(() => import('@/pages/auth/institution-register-page'));
const CartPage = lazy(() => import('@/pages/cart-page'));
const CheckoutPage = lazy(() => import('@/pages/checkout-page'));
const OrdersPage = lazy(() => import('@/pages/account/orders-page'));
const OrderDetailPage = lazy(() => import('@/pages/account/order-detail-page'));
const ProfilePage = lazy(() => import('@/pages/account/profile-page'));
const UpdatesPage = lazy(() => import('@/pages/account/updates-page'));
const InstitutionDashboardPage = lazy(() => import('@/pages/institution/dashboard-page'));
const NewOrderPage = lazy(() => import('@/pages/institution/new-order-page'));
const StudentsPage = lazy(() => import('@/pages/institution/students-page'));
const PhotoLinkPage = lazy(() => import('@/pages/photo-link-page'));
const NotFoundPage = lazy(() => import('@/pages/not-found-page'));
const TrackPage = lazy(() => import('@/pages/track-page'));
const UnsubscribePage = lazy(() => import('@/pages/unsubscribe-page'));
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
      // Prices now live on each product as quantity offers; keep old links working.
      { path: 'pricing', element: <Navigate to="/products" replace /> },
      { path: 'institutions', element: page(<InstitutionsPage />) },
      { path: 'business-printing', element: page(<BusinessPrintingPage />) },
      { path: 'wedding-cards', element: page(<WeddingCardsPage />) },
      { path: 'contact', element: page(<ContactPage />) },
      { path: 'track', element: page(<TrackPage />) },
      { path: 'unsubscribe', element: page(<UnsubscribePage />) },
      { path: 'terms', element: page(<LegalPage kind="terms" />) },
      { path: 'privacy', element: page(<LegalPage kind="privacy" />) },
      { path: 'refund-policy', element: page(<LegalPage kind="refund" />) },
      { path: 'shipping-policy', element: page(<LegalPage kind="shipping" />) },
      { path: 'cart', element: page(<CartPage />) },

      { path: 'login', element: page(<GuestOnly><LoginPage /></GuestOnly>) },
      // Old institution sign-in URL; it is now a tab of /login.
      { path: 'institutions/login', element: <InstitutionLoginRedirect /> },
      { path: 'institutions/register', element: page(<GuestOnly><InstitutionRegisterPage /></GuestOnly>) },
      { path: 'institutions/forgot-password', element: page(<GuestOnly><InstitutionPasswordPage /></GuestOnly>) },

      { path: 'checkout', element: page(<RequireAuth><CheckoutPage /></RequireAuth>) },
      { path: 'account/orders', element: page(<RequireAuth><OrdersPage /></RequireAuth>) },
      { path: 'account/orders/:id', element: page(<RequireAuth><OrderDetailPage /></RequireAuth>) },
      { path: 'account/profile', element: page(<RequireAuth><ProfilePage /></RequireAuth>) },
      { path: 'account/updates', element: page(<RequireAuth><UpdatesPage /></RequireAuth>) },
      { path: 'institution', element: page(<RequireAuth kind="institution"><InstitutionDashboardPage /></RequireAuth>) },
      { path: 'institution/orders/new', element: page(<RequireAuth kind="institution"><NewOrderPage /></RequireAuth>) },
      { path: 'institution/students', element: page(<RequireAuth kind="institution"><StudentsPage /></RequireAuth>) },
      // A class teacher's photo link: no sign-in.
      { path: 'p/:token', element: page(<PhotoLinkPage />) },

      { path: '*', element: page(<NotFoundPage />) },
    ],
  },
]);
