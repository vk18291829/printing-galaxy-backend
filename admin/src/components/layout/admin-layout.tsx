import {
  IconArrowLeft,
  IconBoxSeam,
  IconBuildingCommunity,
  IconCategory,
  IconChevronsLeft,
  IconChevronsRight,
  IconDots,
  IconExternalLink,
  IconFileSpreadsheet,
  IconHistory,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconMoon,
  IconPackage,
  IconReceipt,
  IconReportAnalytics,
  IconSettings,
  IconSpeakerphone,
  IconStars,
  IconSun,
  IconTags,
  IconTruckDelivery,
  IconUserShield,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';
import { Fragment, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { useTheme } from '@/components/theme-provider';
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
import { useStaffLogout } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { useDashboard } from '@/features/management/api';
import { cn } from '@/lib/utils';
import { useBreadcrumbs } from './breadcrumbs';

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  adminOnly?: boolean;
  badge?: 'orders' | 'institutions' | 'stock' | 'reviews';
  end?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Operations',
    items: [
      { to: '/', label: 'Dashboard', icon: IconLayoutDashboard, end: true },
      { to: '/orders', label: 'Orders', icon: IconPackage, badge: 'orders', end: true },
      { to: '/orders/new', label: 'Walk-in order', icon: IconReceipt },
      { to: '/bulk-jobs', label: 'Bulk card lists', icon: IconFileSpreadsheet },
      { to: '/deliveries', label: 'Deliveries', icon: IconTruckDelivery },
      { to: '/inventory', label: 'Materials & stock', icon: IconBoxSeam, badge: 'stock' },
    ],
  },
  {
    section: 'Catalogue',
    items: [
      { to: '/products', label: 'Products & prices', icon: IconTags, adminOnly: true },
      { to: '/categories', label: 'Categories', icon: IconCategory, adminOnly: true },
    ],
  },
  {
    section: 'Marketing',
    items: [
      { to: '/banners', label: 'Banners & offers', icon: IconSpeakerphone, adminOnly: true },
      { to: '/reviews', label: 'Ratings & reviews', icon: IconStars, badge: 'reviews' },
    ],
  },
  {
    section: 'People',
    items: [
      { to: '/institutions', label: 'Institutions', icon: IconBuildingCommunity, badge: 'institutions' },
      { to: '/customers', label: 'Customers', icon: IconUsers },
      { to: '/staff', label: 'Staff', icon: IconUserShield, adminOnly: true },
    ],
  },
  {
    section: 'System',
    items: [
      { to: '/reports', label: 'Reports', icon: IconReportAnalytics, adminOnly: true },
      { to: '/settings', label: 'Settings', icon: IconSettings, adminOnly: true },
      { to: '/audit', label: 'Audit log', icon: IconHistory, adminOnly: true },
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
    <Link to="/" className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white shadow-xs ring-1 ring-black/5">
        <img src="/logo.png" alt="" className="size-6 object-contain" />
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-foreground">Printing Galaxy</span>
          <span className="block truncate text-xs text-muted-foreground">Admin panel</span>
        </span>
      )}
    </Link>
  );
}

function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'admin';
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
        const items = group.items.filter((i) => !i.adminOnly || isAdmin);
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
  const { resolvedTheme, setTheme } = useTheme();
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
        <DropdownMenuItem onSelect={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
          {resolvedTheme === 'dark' ? <IconSun /> : <IconMoon />} {resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}
        </DropdownMenuItem>
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
        <UserMenu collapsed={collapsed} />
      </div>
    </div>
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
        {parent && crumbs.length > 2 && (
          <Button variant="ghost" size="icon-sm" asChild aria-label={`Back to ${parent.label}`}>
            <Link to={parent.to}>
              <IconArrowLeft />
            </Link>
          </Button>
        )}
        <span className="truncate text-sm font-semibold">{current.label}</span>
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
      <div className="flex min-h-dvh">
        <aside
          className={cn(
            'sticky top-0 hidden h-dvh shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block',
            collapsed ? 'w-16' : 'w-64',
          )}
        >
          <SidebarBody collapsed={collapsed} onToggle={toggle} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b bg-background/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="page-container flex h-14 items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
                <IconMenu2 className="size-5" />
              </Button>
              <SheetContent side="left" className="w-72 gap-0 border-sidebar-border bg-sidebar p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SidebarBody onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>
            <HeaderNav />
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="sm" className="hidden text-muted-foreground sm:inline-flex" asChild>
                <a href={WEBSITE_URL} target="_blank" rel="noreferrer">
                  <IconExternalLink /> Website
                </a>
              </Button>
              <ThemeToggle />
            </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="page-container">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
