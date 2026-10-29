import { IconHome, IconLayoutDashboard, IconLayoutGrid, IconPackage, IconShoppingBag, IconUser, IconUsers } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router';
import { useAuthStore } from '@/features/auth/auth-store';
import { useCartCount } from '@/features/cart/cart-store';
import { cn } from '@/lib/utils';

/** Screens with their own bottom action bar (price + add / order buttons). */
const OWN_BAR = [/^\/products\/[^/]+$/, /^\/checkout/, /^\/institution\/orders\/new/, /^\/p\//];

export function useBottomTabsVisible() {
  const { pathname } = useLocation();
  return !OWN_BAR.some((rx) => rx.test(pathname));
}

function Tab({ to, icon, label, end, badge }: { to: string; icon: ReactNode; label: string; end?: boolean; badge?: number }) {
  return (
    <NavLink to={to} end={end} className="relative flex flex-1 flex-col items-center justify-center gap-1 pt-1">
      {({ isActive }) => (
        <>
          {/* The open screen: an amber mark on top and a navy pill behind the icon. */}
          <span className={cn('absolute top-0 h-[3px] w-8 rounded-b-full transition-colors', isActive ? 'bg-brand-amber' : 'bg-transparent')} />
          <span
            className={cn(
              'relative grid h-8 w-14 place-items-center rounded-full transition-colors [&_svg]:size-[22px]',
              isActive ? 'bg-brand-navy text-white' : 'text-muted-foreground',
            )}
          >
            {icon}
            {badge ? (
              <span className="absolute -top-1 right-1.5 grid min-w-[18px] place-items-center rounded-full bg-brand-amber px-1 text-[10px] leading-[18px] font-bold text-brand-navy ring-2 ring-background">
                {badge}
              </span>
            ) : null}
          </span>
          <span className={cn('max-w-full truncate px-1 text-[11px] transition-colors', isActive ? 'font-bold text-brand-navy' : 'font-medium text-muted-foreground')}>{label}</span>
        </>
      )}
    </NavLink>
  );
}

/**
 * Phone tab bar, like an app: the places people go most. Schools get their dashboard and student
 * list; individuals get products, cart and orders.
 */
export function BottomTabs() {
  const { t } = useTranslation();
  const principal = useAuthStore((s) => s.principal);
  const cartCount = useCartCount();
  const visible = useBottomTabsVisible();
  if (!visible) return null;
  const isInstitution = principal?.kind === 'institution';

  return (
    <nav
      aria-label={t('nav.menu')}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch">
        <Tab to="/" end icon={<IconHome />} label={t('nav.home')} />
        {isInstitution ? (
          <>
            <Tab to="/institution" end icon={<IconLayoutDashboard />} label={t('nav.dashboard')} />
            <Tab to="/institution/students" icon={<IconUsers />} label={t('nav.studentsShort')} />
          </>
        ) : (
          <>
            <Tab to="/products" icon={<IconLayoutGrid />} label={t('nav.products')} />
            <Tab to="/cart" icon={<IconShoppingBag />} label={t('nav.cart')} badge={cartCount} />
          </>
        )}
        <Tab to="/account/orders" icon={<IconPackage />} label={t('nav.myOrdersShort')} />
        <Tab to={principal ? '/account/profile' : '/login'} icon={<IconUser />} label={principal ? t('nav.profile') : t('common.signIn')} />
      </div>
    </nav>
  );
}
