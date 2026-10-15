import {
  IconBoxSeam,
  IconBuildingCommunity,
  IconCategory,
  IconExternalLink,
  IconFileSpreadsheet,
  IconHistory,
  IconLayoutDashboard,
  IconLogout,
  IconMenu2,
  IconPackage,
  IconReceipt,
  IconReportAnalytics,
  IconSettings,
  IconTags,
  IconTruckDelivery,
  IconUserShield,
  IconUsers,
  type Icon,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useStaffLogout } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { useDashboard } from '@/features/management/api';
import { cn } from '@/lib/utils';

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
  adminOnly?: boolean;
  badge?: 'orders' | 'institutions' | 'stock';
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

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'admin';
  const isRider = role === 'delivery';
  const { data } = useDashboard(!isRider);
  const openOrders = Object.values(data?.openByStatus ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  const badges = { orders: openOrders, institutions: data?.pendingInstitutions ?? 0, stock: data?.lowStock?.length ?? 0 };

  return (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4" onClick={onNavigate}>
      {(isRider ? RIDER_NAV : NAV).map((group) => {
        const items = group.items.filter((i) => !i.adminOnly || isAdmin);
        if (items.length === 0) return null;
        return (
          <div key={group.section}>
            <p className="mb-2 px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                        isActive && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
                      )
                    }
                  >
                    <item.icon className="size-[18px]" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && badges[item.badge] > 0 && (
                      <Badge variant={item.badge === 'orders' ? 'secondary' : 'warning'} className="px-1.5 py-0 text-[10px]">
                        {badges[item.badge]}
                      </Badge>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex h-16 items-center gap-2.5 border-b px-5">
      <span className="grid size-9 place-items-center rounded-lg bg-white shadow-sm ring-1 ring-black/5">
        <img src="/logo.png" alt="" className="size-7 object-contain" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-bold">Printing Galaxy</p>
        <p className="text-[11px] font-medium text-muted-foreground">Admin panel</p>
      </div>
    </div>
  );
}

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useStaffLogout();
  const { pathname } = useLocation();

  // Riders have no access to the office pages; keep them on their delivery list.
  if (user?.role === 'delivery' && !pathname.startsWith('/deliveries')) return <Navigate to="/deliveries" replace />;

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r bg-card lg:flex">
        <Brand />
        <SidebarNav />
        <div className="h-1 cmyk-strip" />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-xl sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="size-9 lg:hidden" aria-label="Open menu">
                <IconMenu2 className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 gap-0 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Brand />
              <SidebarNav onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
              <a href={WEBSITE_URL} target="_blank" rel="noreferrer">
                <IconExternalLink /> Website
              </a>
            </Button>
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2">
                  <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-white">
                    {(user?.name || user?.email || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden text-sm font-medium sm:inline">{user?.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-foreground">
                  <p className="truncate text-sm">{user?.name}</p>
                  <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
                  <Badge variant="soft" className="mt-1.5 capitalize">{user?.role}</Badge>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}
                >
                  <IconLogout /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
