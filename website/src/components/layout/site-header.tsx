import {
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
import { Link, NavLink, useNavigate } from 'react-router';
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
import { useCartCount } from '@/features/cart/cart-store';
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
          <span className="absolute -top-0.5 -right-0.5 grid min-w-[18px] place-items-center rounded-full bg-brand-magenta px-1 text-[10px] leading-[18px] font-bold text-white">
            {count}
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
      <Button size="sm" className="h-9 px-4" asChild>
        <Link to="/login">{t('common.signIn')}</Link>
      </Button>
    );
  }

  const isInstitution = principal.kind === 'institution';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-9" aria-label={t('nav.account')}>
          {isInstitution ? <IconBuildingCommunity className="size-5" /> : <IconUserCircle className="size-5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-sm text-foreground">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isInstitution && (
          <DropdownMenuItem onSelect={() => navigate('/institution')}>
            <IconLayoutDashboard /> {t('nav.dashboard')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => navigate('/account/orders')}>
          <IconPackage /> {t('nav.myOrders')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/account/profile')}>
          <IconUser /> {t('nav.profile')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => logout.mutate(undefined, { onSettled: () => navigate('/') })}>
          <IconLogout /> {t('common.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SiteHeader() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const principal = useAuthStore((s) => s.principal);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="container-page flex h-16 items-center gap-2 sm:gap-4">
        <Logo />

        <nav className="ml-6 hidden items-center gap-1 lg:flex">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
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
          <CartButton />
          <div className="hidden sm:block">
            <AccountMenu />
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 lg:hidden" aria-label={t('nav.menu')}>
                <IconMenu2 className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="gap-0 overflow-y-auto">
              <SheetHeader className="border-b">
                <SheetTitle className="text-left">{t('nav.menu')}</SheetTitle>
              </SheetHeader>
              <div className="flex items-center justify-between border-b px-4 py-2 min-[380px]:hidden">
                <span className="text-sm text-muted-foreground">{t('nav.theme')}</span>
                <ThemeToggle />
              </div>
              <nav className="flex flex-col p-3" onClick={() => setOpen(false)}>
                {[{ to: '/', key: 'nav.home' } as const, ...NAV].map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    className={({ isActive }) =>
                      cn('rounded-lg px-3 py-3 text-base font-medium hover:bg-accent', isActive && 'bg-accent text-primary')
                    }
                  >
                    {t(item.key)}
                  </NavLink>
                ))}
                <div className="my-3 h-px bg-border" />
                {principal ? (
                  <>
                    {principal.kind === 'institution' && (
                      <NavLink to="/institution" className="rounded-lg px-3 py-3 font-medium hover:bg-accent">
                        {t('nav.dashboard')}
                      </NavLink>
                    )}
                    <NavLink to="/account/orders" className="rounded-lg px-3 py-3 font-medium hover:bg-accent">
                      {t('nav.myOrders')}
                    </NavLink>
                    <NavLink to="/account/profile" className="rounded-lg px-3 py-3 font-medium hover:bg-accent">
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
                  </div>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
