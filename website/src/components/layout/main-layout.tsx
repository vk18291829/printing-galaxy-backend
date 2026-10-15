import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { OfflineBanner } from '@/features/pwa/pwa';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

export function MainLayout() {
  return (
    <div className="flex min-h-dvh flex-col">
      <ScrollToTop />
      <OfflineBanner />
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
