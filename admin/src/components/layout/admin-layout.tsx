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
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Badge } from '@/components/ui/badge';
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

const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL ?? 'http://localhost:5173';
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
      {/* No box: the dark-theme file has light ink so the mark stays visible. */}
      <img src="/logo-mark.png?v=3" alt="" width={40} height={40} className="size-10 shrink-0 object-contain dark:hidden" />
      <img src="/logo-mark-dark.png?v=3" alt="" width={40} height={40} className="hidden size-10 shrink-0 object-contain dark:block" />
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-base font-semibold text-foreground">Printing Galaxy</span>
          <span className="block truncate text-xs text-muted-foreground">Admin panel</span>
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
              <p className="mb-1.5 px-2.5 text-xs font-medium text-muted-foreground">{group.section}</p>
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
                        'group relative flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground',
                        collapsed && 'justify-center px-0',
                        isActive && 'bg-sidebar-accent font-medium text-foreground',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-primary" />}
                        <item.icon className={cn('size-4.5 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                        {count > 0 &&
                          (collapsed ? (
                            <span className={cn('absolute top-1.5 right-1.5 size-2 rounded-full', item.badge === 'orders' ? 'bg-primary' : 'bg-warning')} />
                          ) : (
                            <Badge variant={item.badge === 'orders' ? 'secondary' : 'warning'} className="h-5 min-w-5 justify-center px-1.5 py-0 text-[11px] tabular-nums">
                              {count}
                            </Badge>
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
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{initial}</span>
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
    <div className="flex h-full flex-col">
      <div className={cn('flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4', collapsed && 'justify-center px-0')}>
        <Brand collapsed={collapsed} />
      </div>
      <SidebarNav collapsed={collapsed} onNavigate={onNavigate} />
      <div className="space-y-1 border-t border-sidebar-border p-3">
        {onToggle && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggle}
            className={cn('w-full justify-start text-muted-foreground', collapsed && 'justify-center px-0')}
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
function BottomTabs({ onMore }: { onMore: () => void }) {
  const user = useAuthStore((s) => s.user);
  const can = (p: Permission) => user?.role === 'admin' || Boolean(user?.permissions?.includes(p));
  const rider = user?.role === 'delivery';
  const tab = 'flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors';
  const on = 'text-primary';
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-12px_rgb(20_43_74/0.35)] backdrop-blur-xl lg:hidden"
      aria-label="Main"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch px-2">
        {!rider && (
          <NavLink to="/" end className={({ isActive }) => cn(tab, isActive && on)}>
            <IconLayoutDashboard className="size-6" /> Home
          </NavLink>
        )}
        {!rider && can('orders') && (
          <NavLink to="/orders" end className={({ isActive }) => cn(tab, isActive && on)}>
            <IconPackage className="size-6" /> Orders
          </NavLink>
        )}
        {!rider && can('walkin') && (
          <div className="flex flex-1 items-start justify-center">
            <Link
              to="/orders/new"
              aria-label="New walk-in order"
              className="-mt-5 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/40 ring-4 ring-background active:scale-95"
            >
              <IconPlus className="size-7" stroke={2.5} />
            </Link>
          </div>
        )}
        {(rider || can('orders')) && (
          <NavLink to="/deliveries" className={({ isActive }) => cn(tab, isActive && on)}>
            <IconTruckDelivery className="size-6" /> {rider ? 'My deliveries' : 'Deliveries'}
          </NavLink>
        )}
        <button type="button" onClick={onMore} className={tab}>
          <IconMenu2 className="size-6" /> More
        </button>
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
      <div className="flex min-w-0 items-center gap-1 lg:hidden">
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
      <Breadcrumb className="hidden min-w-0 lg:block">
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
  const user = useAuthStore((s) => s.user);
  const { pathname } = useLocation();
  const scroller = useRef<HTMLDivElement>(null);

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
            'hidden h-full shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block',
            collapsed ? 'w-16' : 'w-64',
          )}
        >
          <SidebarBody collapsed={collapsed} onToggle={toggle} />
        </aside>

        {/* `relative` keeps absolutely placed bits (hidden native selects, sr-only labels) inside this
            scroller; without it they stretch the page and the browser adds a second scrollbar. */}
        <div ref={scroller} className="relative flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          {/* Solid, not frosted: a backdrop blur pulls the white sidebar into the header's edge and
              re-renders (shimmers) whenever anything in the header changes on hover. */}
          <header className="sticky top-0 z-30 border-b bg-background px-4 sm:px-6 lg:px-8">
            <div className="page-container flex h-14 items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetContent side="left" className="w-72 gap-0 border-sidebar-border bg-sidebar p-0">
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

          <main className="flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-6">
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
