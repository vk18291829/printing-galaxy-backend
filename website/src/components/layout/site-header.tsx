import {
  IconBell,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconPackage,
  IconShoppingBag,
  IconUser,
  IconUsers,
  IconUserCircle,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { DynamicIcon } from '@/components/common/dynamic-icon';
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useLogout } from '@/features/auth/api';
import { useAuthStore, useDisplayName } from '@/features/auth/auth-store';
import { useUpdates } from '@/features/updates/api';
import { useCartCount } from '@/features/cart/cart-store';
import { useCategories } from '@/features/catalog/api';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { categoryHome } from '@/features/catalog/sections';

type NavItem = { to: string; key: string };

const NAV: NavItem[] = [
  { to: '/products', key: 'nav.products' },
  { to: '/institutions', key: 'nav.schoolSolutions' },
  { to: '/business-printing', key: 'nav.businessPrinting' },
  { to: '/wedding-cards', key: 'nav.weddingCards' },
];

/** Lit for the page itself and anything below it (e.g. /products/visiting-card under Products). */
function useIsNavActive() {
  const { pathname } = useLocation();
  return (item: NavItem) => pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function CartButton() {
  const { t } = useTranslation();
  const count = useCartCount();
  return (
    <Button variant="ghost" size="icon" className="relative size-9" asChild>
      <Link to="/cart" aria-label={t('nav.cart')}>
        <IconShoppingBag className="size-[19px]" />
        {count > 0 && (
          <span className="bg-primary absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] leading-[18px] font-bold text-white">
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
          <span className="bg-primary absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] leading-[18px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}

/** "Galaxy Public School" → "GP". */
function initials(name: string) {
  const words = name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '?';
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
          {isInstitution ? (
            <span className="grid size-8 place-items-center rounded-full bg-brand-navy text-xs font-bold text-white ring-2 ring-primary/30">
              {initials(name)}
            </span>
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
  const l = useLocalized();
  const [open, setOpen] = useState(false);
  const principal = useAuthStore((s) => s.principal);
  const { data: categories } = useCategories();
  const isActive = useIsNavActive();

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="container-page flex h-16 items-center gap-2 sm:gap-4 lg:h-[72px]">
        <Logo />

        <nav className="ml-4 hidden items-center gap-1 lg:flex xl:ml-8">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={isActive(item) ? 'page' : undefined}
              className={cn(
                'text-brand-navy/75 hover:text-brand-navy relative px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors after:absolute after:inset-x-3 after:-bottom-[15px] after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 after:transition-opacity',
                isActive(item) && 'text-brand-navy after:opacity-100',
              )}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <UpdatesButton />
          {principal?.kind !== 'institution' && <CartButton />}
          {principal?.kind === 'institution' && (
            <Button size="sm" className="mx-1 hidden h-9 px-4 md:inline-flex" asChild>
              <Link to="/institution">
                <IconLayoutDashboard /> {t('nav.dashboard')}
              </Link>
            </Button>
          )}
          <div className="hidden sm:block">
            <AccountMenu />
          </div>
          {principal?.kind !== 'institution' && (
            <Button size="sm" className="ml-1 hidden h-9 px-4 md:inline-flex" asChild>
              <Link to="/contact">{t('nav.quote')}</Link>
            </Button>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 lg:hidden"
                aria-label={t('nav.menu')}
              >
                <IconMenu2 className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="gap-0 overflow-y-auto">
              <SheetHeader className="border-b">
                <SheetTitle className="text-left">{t('nav.menu')}</SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col p-3" onClick={() => setOpen(false)}>
                <NavLink
                  to="/"
                  end
                  className={({ isActive: home }) => cn('hover:bg-accent rounded-lg px-3 py-3 text-base font-medium', home && 'bg-primary/8 text-primary')}
                >
                  {t('nav.home')}
                </NavLink>
                {[...NAV, { to: '/contact', key: 'nav.contact' }].map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={isActive(item) ? 'page' : undefined}
                    className={cn('hover:bg-accent rounded-lg px-3 py-3 text-base font-medium', isActive(item) && 'bg-primary/8 text-primary')}
                  >
                    {t(item.key)}
                  </Link>
                ))}
                <div className="bg-border my-3 h-px" />
                {principal ? (
                  <>
                    {principal.kind === 'institution' && (
                      <>
                        <NavLink
                          to="/institution"
                          className="hover:bg-accent rounded-lg px-3 py-3 font-medium"
                        >
                          {t('nav.dashboard')}
                        </NavLink>
                        <NavLink
                          to="/institution/students"
                          className="hover:bg-accent rounded-lg px-3 py-3 font-medium"
                        >
                          {t('nav.students')}
                        </NavLink>
                      </>
                    )}
                    <NavLink
                      to="/account/orders"
                      className="hover:bg-accent rounded-lg px-3 py-3 font-medium"
                    >
                      {t('nav.myOrders')}
                    </NavLink>
                    <NavLink
                      to="/account/updates"
                      className="hover:bg-accent rounded-lg px-3 py-3 font-medium"
                    >
                      {t('nav.updates')}
                    </NavLink>
                    <NavLink
                      to="/account/profile"
                      className="hover:bg-accent rounded-lg px-3 py-3 font-medium"
                    >
                      {t('nav.profile')}
                    </NavLink>
                  </>
                ) : (
                  <div className="grid gap-2 px-1">
                    <Button asChild>
                      <Link to="/contact">{t('nav.quote')}</Link>
                    </Button>
                    <Button variant="navy" asChild>
                      <Link to="/login">{t('common.signIn')}</Link>
                    </Button>
                    <Button variant="ghost" asChild>
                      <Link to="/institutions/register">{t('nav.institutionRegister')}</Link>
                    </Button>
                  </div>
                )}
                {categories && categories.length > 0 && (
                  <>
                    <div className="bg-border my-3 h-px" />
                    <p className="text-muted-foreground px-3 pb-1 text-xs font-medium">
                      {t('nav.categories')}
                    </p>
                    {categories.map((c) => (
                      <Link
                        key={c._id}
                        to={categoryHome(c.slug)}
                        className="hover:bg-accent flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium"
                      >
                        <DynamicIcon name={c.icon} className="text-primary size-4" /> {l(c.name)}
                      </Link>
                    ))}
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
