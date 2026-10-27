import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { TopBar } from '@/features/marketing/offer-strip';
import { OfflineBanner } from '@/features/pwa/pwa';
import { BottomTabs, useBottomTabsVisible } from './bottom-tabs';
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
  const tabs = useBottomTabsVisible();
  const { pathname } = useLocation();
  return (
    // Room for the phone tab bar under the footer.
    <div className={cn('flex min-h-dvh flex-col', tabs && 'pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0')}>
      <ScrollToTop />
      <OfflineBanner />
      <TopBar />
      <SiteHeader />
      {/* Each screen fades up gently as it opens. */}
      <main key={pathname} className="page-enter flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <BottomTabs />
    </div>
  );
}
