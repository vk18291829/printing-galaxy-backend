import { IconCategory, IconCheck, IconFile, IconLink, IconSearch, IconTags } from '@tabler/icons-react';
import { useState } from 'react';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAdminCategories, useAdminProducts } from '@/features/catalog/api';
import { cn } from '@/lib/utils';

export const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL ?? 'http://localhost:5173';

/** Public website pages worth linking to from a banner or offer email. */
const PAGES = [
  { path: '/', label: 'Home' },
  { path: '/products', label: 'All products' },
  { path: '/wedding-cards', label: 'Wedding cards' },
  { path: '/business-printing', label: 'Business printing' },
  { path: '/institutions', label: 'For schools & institutions' },
  { path: '/track', label: 'Track an order' },
  { path: '/contact', label: 'Contact us' },
];

interface LinkRow {
  path: string;
  label: string;
}

/**
 * "View all links" button: lists the website's pages, categories and products so staff can pick a link
 * instead of typing it. `absolute` gives full https:// addresses (emails need them); otherwise site paths.
 */
export function LinkPicker({ value, onPick, absolute }: { value?: string; onPick: (link: string) => void; absolute?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const categories = useAdminCategories();
  const products = useAdminProducts({ status: 'active' });
  const toLink = (path: string) => (absolute ? `${WEBSITE_URL.replace(/\/$/, '')}${path}` : path);

  const match = (r: LinkRow) => !q.trim() || `${r.label} ${r.path}`.toLowerCase().includes(q.trim().toLowerCase());
  const groups: { title: string; icon: typeof IconFile; rows: LinkRow[]; loading?: boolean }[] = [
    { title: 'Pages', icon: IconFile, rows: PAGES.filter(match) },
    {
      title: 'Categories',
      icon: IconCategory,
      loading: categories.isLoading,
      rows: (categories.data ?? []).filter((c) => c.isActive).map((c) => ({ path: `/products?category=${c.slug}`, label: c.name.en })).filter(match),
    },
    {
      title: 'Products',
      icon: IconTags,
      loading: products.isLoading,
      rows: (products.data ?? []).map((p) => ({ path: `/products/${p.slug}`, label: p.name.en })).filter(match),
    },
  ];

  const pick = (path: string) => {
    onPick(toLink(path));
    setOpen(false);
    setQ('');
  };

  return (
    <>
      <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setOpen(true)}>
        <IconLink /> View all links
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-3 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pick a link</DialogTitle>
            <DialogDescription>Pages, categories and products on the website. Tap one to use it.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus className="pl-9" placeholder="Search pages, categories, products" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="-mx-2 max-h-[55dvh] space-y-4 overflow-y-auto px-2">
            {groups.map((g) => (
              <section key={g.title}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{g.title}</p>
                {g.loading ? (
                  <div className="py-3">
                    <Spinner />
                  </div>
                ) : g.rows.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">Nothing found</p>
                ) : (
                  <ul>
                    {g.rows.map((r) => {
                      const selected = value === toLink(r.path);
                      return (
                        <li key={r.path}>
                          <button
                            type="button"
                            onClick={() => pick(r.path)}
                            className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted', selected && 'bg-secondary')}
                          >
                            <g.icon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{r.label}</span>
                              <span className="block truncate font-mono text-xs text-muted-foreground">{r.path}</span>
                            </span>
                            {selected && <IconCheck className="size-4 shrink-0 text-primary" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
