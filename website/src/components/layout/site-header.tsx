import {
  IconBell,
  IconLayoutDashboard,
  IconLogout,
  IconPackage,
  IconShoppingBag,
  IconUser,
  IconUsers,
  IconUserCircle,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Logo } from '@/components/common/logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLogout } from '@/features/auth/api';
import { UserAvatar } from '@/features/account/avatar';
import { useAuthStore, useDisplayName } from '@/features/auth/auth-store';
import { useProduct } from '@/features/catalog/api';
import { InstallAppButton } from '@/features/pwa/pwa';
import { categoryHome } from '@/features/catalog/sections';
import { useUpdates } from '@/features/updates/api';
import { useCartCount } from '@/features/cart/cart-store';
import { cn } from '@/lib/utils';

type NavItem = { to: string; key: string };

const NAV: NavItem[] = [
  { to: '/products', key: 'nav.products' },
  { to: '/institutions', key: 'nav.schoolSolutions' },
  { to: '/business-printing', key: 'nav.businessPrinting' },
  { to: '/wedding-cards', key: 'nav.weddingCards' },
];

/**
 * Lit for the page itself and anything below it. A product page lights the section its product
 * belongs to (a school ID card under School & College, a visiting card under Business Works).
 */
function useIsNavActive() {
  const { pathname } = useLocation();
  const slug = /^\/products\/([^/]+)/.exec(pathname)?.[1] ?? '';
  const { data: product } = useProduct(slug);
  const section = slug && product ? categoryHome(product.category.slug).split('?')[0]! : pathname;
  return (item: NavItem) => section === item.to || section.startsWith(`${item.to}/`);
}

function CartButton() {
  const { t } = useTranslation();
  const count = useCartCount();
  return (
    <Button variant="ghost" size="icon" className="relative size-9" asChild>
      <Link to="/cart" aria-label={t('nav.cart')}>
        <IconShoppingBag className="size-[19px]" />
        {count > 0 && (
          <span className="bg-primary absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] leading-[18px] font-bold text-primary-foreground">
            {count}
          </span>
        )}
      </Link>
    </Button>
  );
}

function UpdatesButton() {
  const { t } = useTranslation();
  const signedIn = useAuthStore((s) => s.status === 'authenticated');
  const { data } = useUpdates();
  if (!signedIn) return null;
  const unread = data?.unread ?? 0;
  return (
    <Button variant="ghost" size="icon" className="relative size-9" asChild>
      <Link to="/account/updates" aria-label={unread ? t('updates.unread', { count: unread }) : t('nav.updates')}>
        <IconBell className="size-[19px]" />
        {unread > 0 && (
          <span className="bg-primary absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] leading-[18px] font-bold text-primary-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}


function AccountMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const principal = useAuthStore((s) => s.principal);
  const name = useDisplayName();
  const logout = useLogout();

  if (!principal) {
    return (
      <Button variant="outline" size="sm" className="h-9 px-4" asChild>
        <Link to="/login">{t('common.signIn')}</Link>
      </Button>
    );
  }

  const isInstitution = principal.kind === 'institution';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9 rounded-full" aria-label={t('nav.account')}>
          {isInstitution || principal.user.avatarUrl ? (
            <UserAvatar name={name} src={isInstitution ? undefined : principal.user.avatarUrl} className="size-8 text-xs ring-2 ring-primary/30" />
          ) : (
            <IconUserCircle className="size-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-foreground truncate text-sm">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isInstitution && (
          <DropdownMenuItem onSelect={() => navigate('/institution')} className="bg-primary/8 font-semibold text-primary focus:bg-primary/12 focus:text-primary [&_svg]:text-primary">
            <IconLayoutDashboard /> {t('nav.dashboard')}
          </DropdownMenuItem>
        )}
        {isInstitution && (
          <DropdownMenuItem onSelect={() => navigate('/institution/students')}>
            <IconUsers /> {t('nav.students')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => navigate('/account/orders')}>
          <IconPackage /> {t('nav.myOrders')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/account/updates')}>
          <IconBell /> {t('nav.updates')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/account/profile')}>
          <IconUser /> {t('nav.profile')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() =>
            void confirmAction({
              title: t('confirm.signOutTitle'),
              description: t('confirm.signOutDesc'),
              confirmLabel: t('common.signOut'),
            }).then((ok) => ok && logout.mutate(undefined, { onSettled: () => navigate('/') }))
          }
        >
          <IconLogout /> {t('common.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SiteHeader() {
  const { t } = useTranslation();
  const principal = useAuthStore((s) => s.principal);
  const isActive = useIsNavActive();
  // A hairline appears once the page scrolls under the header.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const sections = [...NAV, { to: '/contact', key: 'nav.contact' }];

  return (
    <header
      className={cn(
        // The border is always there (transparent at the top), so showing it on scroll never moves the page.
        'sticky top-0 z-40 border-b border-transparent bg-background/85 backdrop-blur-xl transition-colors duration-300 supports-[backdrop-filter]:bg-background/75',
        scrolled && 'border-border',
      )}
    >
      <div className="container-page flex h-16 items-center gap-3 lg:h-[72px]">
        <Logo />

        {/* Desktop: sections as pills. */}
        <nav className="ml-6 hidden items-center gap-1 lg:flex xl:ml-10" aria-label={t('nav.menu')}>
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive(item) ? 'page' : undefined}
              className={cn(
                'relative rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap transition-colors',
                isActive(item) ? 'bg-brand-navy text-white' : 'text-foreground/70 hover:bg-secondary hover:text-primary',
              )}
            >
              {t(item.key)}
              {/* Same marker as the phone tab bar: a small amber line under the open section. */}
              {isActive(item) && <span aria-hidden className="absolute -bottom-1.5 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-brand-amber" />}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <InstallAppButton variant="pill" className="mr-1 lg:hidden" />
          <UpdatesButton />
          {principal?.kind !== 'institution' && <CartButton />}
          {principal?.kind === 'institution' && (
            <Button size="sm" className="ml-1 hidden md:inline-flex" asChild>
              <Link to="/institution">
                <IconLayoutDashboard /> {t('nav.dashboard')}
              </Link>
            </Button>
          )}
          <div className="ml-1 hidden sm:block">
            <AccountMenu />
          </div>
        </div>
      </div>

      {/* Phones and tablets: every section one swipe away, no hidden menu. */}
      <nav className="lg:hidden" aria-label={t('nav.menu')}>
        <div className="scrollbar-none container-page flex gap-2 overflow-x-auto pb-3 [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]">
          {sections.map((item) => {
            const on = isActive(item);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={on ? 'page' : undefined}
                className={cn(
                  'shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap transition-colors',
                  on ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground/75 shadow-card',
                )}
              >
                {t(item.key)}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
