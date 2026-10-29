import {
  IconArrowLeft,
  IconBoxSeam,
  IconBuildingCommunity,
  IconCategory,
  IconChevronsLeft,
  IconChevronsRight,
  IconDots,
  IconExternalLink,
  IconActivityHeartbeat,
  IconHistory,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconMessage2,
  IconPackage,
  IconChecklist,
  IconPlus,
  IconReceipt,
  IconReportAnalytics,
  IconSettings,
  IconSpeakerphone,
  IconStars,
  IconTags,
  IconTruckDelivery,
  IconUserShield,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { WEBSITE_URL } from '@/components/common/link-picker';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertsBell, AlertWatcher } from '@/features/alerts/alerts';
import { useStaffLogout } from '@/features/auth/api';
import type { Permission } from '@/lib/permissions';
import { PushToggle } from '@/lib/push';
import { InstallAppButton } from '@/lib/pwa';
import { useAuthStore } from '@/features/auth/auth-store';
import { useDashboard } from '@/features/management/api';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useBreadcrumbs } from './breadcrumbs';

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  /** Owner only (settings, staff, audit…). */
  adminOnly?: boolean;
  /** Shown when the person's roles grant this permission. */
  perm?: Permission;
  badge?: 'orders' | 'institutions' | 'stock' | 'reviews';
  end?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Operations',
    items: [
      { to: '/', label: 'Dashboard', icon: IconLayoutDashboard, end: true },
      { to: '/orders', label: 'Orders', icon: IconPackage, badge: 'orders', end: true, perm: 'orders' },
      { to: '/my-work', label: 'My work', icon: IconChecklist, perm: 'orders' },
      { to: '/orders/new', label: 'Walk-in order', icon: IconReceipt, perm: 'walkin' },
      { to: '/deliveries', label: 'Deliveries', icon: IconTruckDelivery, perm: 'orders' },
      { to: '/inventory', label: 'Materials & stock', icon: IconBoxSeam, badge: 'stock', perm: 'inventory' },
    ],
  },
  {
    section: 'Catalogue',
    items: [
      { to: '/products', label: 'Products & prices', icon: IconTags, perm: 'catalog' },
      { to: '/categories', label: 'Categories', icon: IconCategory, perm: 'catalog' },
    ],
  },
  {
    section: 'Marketing',
    items: [
      { to: '/banners', label: 'Banners & offers', icon: IconSpeakerphone, perm: 'marketing' },
      { to: '/promotions', label: 'Promotions', icon: IconMessage2, perm: 'marketing' },
      { to: '/reviews', label: 'Ratings & reviews', icon: IconStars, badge: 'reviews', perm: 'reviews' },
    ],
  },
  {
    section: 'People',
    items: [
      { to: '/institutions', label: 'Institutions', icon: IconBuildingCommunity, badge: 'institutions', perm: 'institutions' },
      { to: '/customers', label: 'Customers', icon: IconUsers, perm: 'customers' },
      { to: '/staff', label: 'Staff', icon: IconUserShield, adminOnly: true },
    ],
  },
  {
    section: 'System',
    items: [
      { to: '/reports', label: 'Reports', icon: IconReportAnalytics, perm: 'reports' },
      { to: '/settings', label: 'Settings', icon: IconSettings, adminOnly: true },
      { to: '/audit', label: 'Audit log', icon: IconHistory, adminOnly: true },
      { to: '/system', label: 'System activity', icon: IconActivityHeartbeat, adminOnly: true },
    ],
  },
];

/** Delivery riders only get their own list. */
const RIDER_NAV: { section: string; items: NavItem[] }[] = [
  { section: 'Delivery', items: [{ to: '/deliveries', label: 'My deliveries', icon: IconTruckDelivery }] },
];

const COLLAPSE_KEY = 'pg-admin-sidebar';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-3">
      {/* On the navy sidebar: the logo file with light ink. */}
      <img src="/logo-mark-dark.png?v=3" alt="" width={40} height={40} className="size-10 shrink-0 object-contain" />
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-display text-base font-bold text-white">
            Printing <span className="text-brand-amber">Galaxy</span>
          </span>
          <span className="block truncate text-[11px] font-semibold tracking-[0.14em] text-white/55 uppercase">Admin panel</span>
        </span>
      )}
    </Link>
  );
}

function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const role = useAuthStore((s) => s.user?.role);
  const permissions = useAuthStore((s) => s.user?.permissions);
  const isAdmin = role === 'admin';
  const allowed = (i: NavItem) => (i.adminOnly ? isAdmin : !i.perm || isAdmin || Boolean(permissions?.includes(i.perm)));
  const isRider = role === 'delivery';
  const { data } = useDashboard(!isRider);
  const openOrders = Object.values(data?.openByStatus ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const badges = {
    orders: openOrders,
    institutions: data?.pendingInstitutions ?? 0,
    stock: data?.lowStock?.length ?? 0,
    reviews: data?.pendingReviews ?? 0,
  };

  return (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {(isRider ? RIDER_NAV : NAV).map((group) => {
        const items = group.items.filter(allowed);
        if (items.length === 0) return null;
        return (
          <div key={group.section}>
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" />
            ) : (
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-[0.12em] text-white/45 uppercase">{group.section}</p>
            )}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const count = item.badge ? badges[item.badge] : 0;
                const link = (
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-white',
                        collapsed && 'justify-center px-0',
                        isActive && 'bg-white font-semibold text-brand-navy hover:bg-white hover:text-brand-navy',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon className={cn('size-4.5 shrink-0', isActive ? 'text-brand-navy' : 'text-white/60 group-hover:text-white')} />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                        {count > 0 &&
                          (collapsed ? (
                            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand-amber" />
                          ) : (
                            <span
                              className={cn(
                                'grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular-nums',
                                item.badge === 'orders' && !isActive ? 'bg-white/15 text-white' : 'bg-brand-amber text-brand-navy',
                              )}
                            >
                              {count}
                            </span>
                          ))}
                      </>
                    )}
                  </NavLink>
                );
                return (
                  <li key={item.to}>
                    {collapsed ? (
                      <Tooltip>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right">
                          {item.label}
                          {count > 0 ? ` (${count})` : ''}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      link
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function UserMenu({ collapsed }: { collapsed?: boolean }) {
  const user = useAuthStore((s) => s.user);
  const logout = useStaffLogout();
  const navigate = useNavigate();
  const initial = (user?.name || user?.email || '?').slice(0, 1).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring/50',
            collapsed && 'justify-center p-1.5',
          )}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-amber text-sm font-bold text-brand-navy">{initial}</span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-medium text-foreground">{user?.name}</span>
                <span className="block truncate text-xs text-muted-foreground capitalize">{user?.role}</span>
              </span>
              <IconDots className="size-4 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? 'right' : 'top'} align="start" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium text-foreground">{user?.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={WEBSITE_URL} target="_blank" rel="noreferrer">
            <IconExternalLink /> Open website
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() =>
            void confirmAction({
              title: 'Sign out of the admin panel?',
              description: 'You will need your email and password to sign in again.',
              confirmLabel: 'Sign out',
            }).then((ok) => ok && logout.mutate(undefined, { onSettled: () => navigate('/login') }))
          }>
          <IconLogout /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({ collapsed, onNavigate, onToggle }: { collapsed?: boolean; onNavigate?: () => void; onToggle?: () => void }) {
  return (
    <div className="sidebar-navy relative flex h-full flex-col">
      <div className="cmyk-strip h-1 shrink-0" />
      <div className={cn('flex h-16 shrink-0 items-center gap-2 px-4', collapsed && 'justify-center px-0')}>
        <Brand collapsed={collapsed} />
      </div>
      <SidebarNav collapsed={collapsed} onNavigate={onNavigate} />
      <div className="space-y-1 border-t border-sidebar-border p-3">
        {onToggle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className={cn('w-full justify-start text-white/60 hover:bg-white/10 hover:text-white', collapsed && 'justify-center px-0')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <IconChevronsRight /> : <IconChevronsLeft />}
            {!collapsed && 'Collapse'}
          </Button>
        )}
        {!collapsed && <InstallAppButton className="w-full" />}
        {!collapsed && <PushToggle className="w-full" />}
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
  );
}

/**
 * Phone / tablet tab bar, like an app: the screens used all day, a big "+" for a counter order,
 * and More for the full menu. Tabs follow the person's permissions.
 */
/** One tab: an amber mark and a navy pill behind the icon for the open screen. */
function Tab({ to, end, icon, label, onClick }: { to?: string; end?: boolean; icon: ReactNode; label: string; onClick?: () => void }) {
  const body = (isActive: boolean) => (
    <>
      <span className={cn('absolute top-0 h-[3px] w-8 rounded-b-full transition-colors', isActive ? 'bg-brand-amber' : 'bg-transparent')} />
      <span
        className={cn(
          'grid h-8 w-14 place-items-center rounded-full transition-colors [&_svg]:size-[22px]',
          isActive ? 'bg-brand-navy text-white' : 'text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span className={cn('max-w-full truncate px-1 text-[11px] transition-colors', isActive ? 'font-bold text-brand-navy' : 'font-medium text-muted-foreground')}>{label}</span>
    </>
  );
  const cls = 'relative flex flex-1 flex-col items-center justify-center gap-1 pt-1';
  return to ? (
    <NavLink to={to} end={end} className={cls}>
      {({ isActive }) => body(isActive)}
    </NavLink>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body(false)}
    </button>
  );
}

/**
 * Phone / tablet tab bar, like an app: the screens used all day, a big "+" for a counter order,
 * and More for the full menu. Tabs follow the person's permissions.
 */
function BottomTabs({ onMore }: { onMore: () => void }) {
  const user = useAuthStore((s) => s.user);
  const can = (p: Permission) => user?.role === 'admin' || Boolean(user?.permissions?.includes(p));
  const rider = user?.role === 'delivery';
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
      aria-label="Main"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch px-2">
        {!rider && <Tab to="/" end icon={<IconLayoutDashboard />} label="Home" />}
        {!rider && can('orders') && <Tab to="/orders" end icon={<IconPackage />} label="Orders" />}
        {!rider && can('walkin') && (
          <div className="flex flex-1 items-start justify-center">
            <NavLink
              to="/orders/new"
              aria-label="New walk-in order"
              className={({ isActive }) =>
                cn(
                  '-mt-5 grid size-14 place-items-center rounded-full ring-4 ring-background transition-colors active:scale-95',
                  isActive ? 'bg-brand-amber text-brand-navy' : 'bg-primary text-primary-foreground',
                )
              }
            >
              <IconPlus className="size-7" stroke={2.5} />
            </NavLink>
          </div>
        )}
        {(rider || can('orders')) && <Tab to="/deliveries" icon={<IconTruckDelivery />} label={rider ? 'My deliveries' : 'Deliveries'} />}
        <Tab onClick={onMore} icon={<IconMenu2 />} label="More" />
      </div>
    </nav>
  );
}

/** Breadcrumb on desktop; back button and page name on phones and tablets. */
function HeaderNav() {
  const crumbs = useBreadcrumbs();
  const current = crumbs.at(-1)!;
  const parent = crumbs.at(-2);

  return (
    <>
      <div className="flex min-w-0 items-center gap-1 md:hidden">
        {parent && crumbs.length > 2 ? (
          <>
            <Button variant="ghost" size="icon-sm" asChild aria-label={`Back to ${parent.label}`}>
              <Link to={parent.to}>
                <IconArrowLeft />
              </Link>
            </Button>
            <span className="truncate text-sm font-semibold">{current.label}</span>
          </>
        ) : (
          // Main screens show the brand, like any app; the page title is already on the page.
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <img src="/logo-mark.png?v=3" alt="" width={32} height={32} className="size-8 shrink-0 object-contain" />
            <span className="truncate font-display text-[15px] leading-tight font-bold">
              Printing <span className="text-brand-amber">Galaxy</span>
            </span>
          </Link>
        )}
      </div>
      <Breadcrumb className="hidden min-w-0 md:block">
        <BreadcrumbList>
          {crumbs.map((c, i) => (
            <Fragment key={c.to}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {i === crumbs.length - 1 ? (
                  <BreadcrumbPage>{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={c.to}>{c.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </>
  );
}

export function AdminLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // Tablets (768–1023px): the sidebar is an icon rail; its expand button opens the full menu sheet.
  const rail = useMediaQuery('(min-width: 768px) and (max-width: 1023.98px)');
  const user = useAuthStore((s) => s.user);
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);

  // The page itself never scrolls while the shell is shown (see .app-shell in globals.css).
  useEffect(() => {
    document.documentElement.classList.add('app-shell');
    return () => document.documentElement.classList.remove('app-shell');
  }, []);

  // The content column is the scroll container, so reset it (not the window) on navigation.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // Not persisted in private mode.
      }
      return !c;
    });

  // Riders have no access to the office pages; keep them on their delivery list.
  if (user?.role === 'delivery' && !pathname.startsWith('/deliveries')) return <Navigate to="/deliveries" replace />;

  return (
    <TooltipProvider>
      {/* App shell: the sidebar stays put and only the content column scrolls. */}
      <div className="fixed inset-0 flex overflow-hidden">
        <aside
          className={cn(
            'hidden h-full shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:block',
            collapsed || rail ? 'w-16' : 'w-64',
          )}
        >
          <SidebarBody collapsed={collapsed || rail} onToggle={rail ? () => setMobileOpen(true) : toggle} />
        </aside>

        {/* `relative` keeps absolutely placed bits (hidden native selects, sr-only labels) inside this
            scroller; without it they stretch the page and the browser adds a second scrollbar. */}
        <div ref={scroller} className="relative flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          {/* Solid, not frosted: a backdrop blur pulls the white sidebar into the header's edge and
              re-renders (shimmers) whenever anything in the header changes on hover. */}
          <header className="sticky top-0 z-30 border-b bg-card px-4 sm:px-6 lg:px-8">
            <div className="page-container flex h-16 items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetContent side="left" className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 [&>button]:text-white">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarBody onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <HeaderNav />
            <div className="ml-auto flex items-center gap-1">
              <InstallAppButton pill className="lg:hidden" />
              {user?.role !== 'delivery' && <AlertsBell />}
              <Button variant="ghost" size="sm" className="hidden text-muted-foreground sm:inline-flex" asChild>
                <a href={WEBSITE_URL} target="_blank" rel="noreferrer">
                  <IconExternalLink /> Website
                </a>
              </Button>
            </div>
            </div>
          </header>

          <main className="flex-1 px-4 pt-6 pb-28 sm:px-6 sm:pt-8 md:pb-8 lg:px-8">
            <div key={pathname} className="page-container page-enter">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      <BottomTabs onMore={() => setMobileOpen(true)} />
      {user?.role !== 'delivery' && <AlertWatcher />}
    </TooltipProvider>
  );
}
