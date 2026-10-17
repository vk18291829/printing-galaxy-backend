import {
  IconBell,
  IconBuildingCommunity,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconPackage,
  IconShoppingBag,
  IconUser,
  IconUserCircle,
} from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { LanguageSwitcher } from '@/components/common/language-switcher';
import { Logo } from '@/components/common/logo';
import { ThemeToggle } from '@/components/common/theme-toggle';
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

const NAV = [
  { to: '/products', key: 'nav.products' },
  { to: '/pricing', key: 'nav.pricing' },
  { to: '/institutions', key: 'nav.institutions' },
  { to: '/contact', key: 'nav.contact' },
] as const;

function CartButton() {
  const { t } = useTranslation();
  const count = useCartCount();
  return (
    <Button variant="ghost" size="icon" className="relative size-9" asChild>
      <Link to="/cart" aria-label={t('nav.cart')}>
        <IconShoppingBag className="size-[19px]" />
        {count > 0 && (
          <span className="bg-brand-magenta absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] leading-[18px] font-bold text-white">
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
          <span className="bg-brand-magenta absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] leading-[18px] font-bold text-white">
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
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="hidden h-9 px-3 xl:inline-flex" asChild>
          <Link to="/institutions/login">
            <IconBuildingCommunity /> {t('nav.institutionLogin')}
          </Link>
        </Button>
        <Button size="sm" className="h-9 px-4" asChild>
          <Link to="/login">{t('common.signIn')}</Link>
        </Button>
      </div>
    );
  }

  const isInstitution = principal.kind === 'institution';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label={t('nav.account')}>
          {isInstitution ? (
            <IconBuildingCommunity className="size-5" />
          ) : (
            <IconUserCircle className="size-5" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-foreground truncate text-sm">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isInstitution && (
          <DropdownMenuItem onSelect={() => navigate('/institution')}>
            <IconLayoutDashboard /> {t('nav.dashboard')}
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

/** Second header row on tablets and up: every category, one tap away (like a shop's aisle signs). */
function CategoryBar() {
  const l = useLocalized();
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { data } = useCategories();
  // The products page has its own category filter; showing both would duplicate it.
  if (!data?.length || pathname === '/products') return null;

  return (
    <div className="border-border/60 hidden border-t md:block">
      <div className="container-page">
        <nav
          aria-label={t('nav.categories')}
          className="-mx-2.5 flex h-11 scrollbar-none items-center gap-1 overflow-x-auto [mask-image:linear-gradient(to_right,#000_92%,transparent)]"
        >
          {data.map((c) => (
            <Link
              key={c._id}
              to={`/products?category=${c.slug}`}
              className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors"
            >
              <DynamicIcon name={c.icon} className="size-4" /> {l(c.name)}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const { t } = useTranslation();
  const l = useLocalized();
  const [open, setOpen] = useState(false);
  const principal = useAuthStore((s) => s.principal);
  const { data: categories } = useCategories();

  return (
    <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="container-page flex h-16 items-center gap-2 sm:gap-4">
        <Logo />

        <nav className="ml-6 hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive && 'text-foreground',
                )
              }
            >
              {t(item.key)}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <LanguageSwitcher />
          {/* On very small phones the theme toggle moves into the menu. */}
          <div className="hidden min-[380px]:block">
            <ThemeToggle />
          </div>
          <UpdatesButton />
          <CartButton />
          <div className="hidden sm:block">
            <AccountMenu />
          </div>

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
              <div className="flex items-center justify-between border-b px-4 py-2 min-[380px]:hidden">
                <span className="text-muted-foreground text-sm">{t('nav.theme')}</span>
                <ThemeToggle />
              </div>
              <nav className="flex flex-col p-3" onClick={() => setOpen(false)}>
                {[{ to: '/', key: 'nav.home' } as const, ...NAV].map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    className={({ isActive }) =>
                      cn(
                        'hover:bg-accent rounded-lg px-3 py-3 text-base font-medium',
                        isActive && 'bg-accent text-primary',
                      )
                    }
                  >
                    {t(item.key)}
                  </NavLink>
                ))}
                <div className="bg-border my-3 h-px" />
                {principal ? (
                  <>
                    {principal.kind === 'institution' && (
                      <NavLink
                        to="/institution"
                        className="hover:bg-accent rounded-lg px-3 py-3 font-medium"
                      >
                        {t('nav.dashboard')}
                      </NavLink>
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
                      <Link to="/login">{t('common.signIn')}</Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/institutions/login">{t('nav.institutionLogin')}</Link>
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
                        to={`/products?category=${c.slug}`}
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
      <CategoryBar />
    </header>
  );
}
