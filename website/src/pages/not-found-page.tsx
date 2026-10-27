import { IconArrowRight, IconHome, IconMail, IconPackage, IconSearch, IconShoppingBag } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCategories } from '@/features/catalog/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { useLocalized } from '@/lib/i18n';
import { categoryHome } from '@/features/catalog/sections';

export default function NotFoundPage() {
  const { t } = useTranslation();
  const l = useLocalized();
  useDocumentTitle(t('notFound.title'));
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const { data: categories } = useCategories();

  const search = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/products?q=${encodeURIComponent(q.trim())}` : '/products');
  };
  const links = [
    { to: '/', label: t('nav.home'), icon: IconHome },
    { to: '/products', label: t('nav.products'), icon: IconShoppingBag },
    { to: '/account/orders', label: t('nav.myOrders'), icon: IconPackage },
    { to: '/contact', label: t('nav.contact'), icon: IconMail },
  ];

  return (
    <div className="container-page py-12 sm:py-16">
      <div className="relative isolate mx-auto max-w-3xl overflow-hidden rounded-3xl shadow-card bg-card px-6 py-12 text-center sm:px-12">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-60" aria-hidden />
        <p className="text-7xl font-bold text-brand-gradient sm:text-8xl">404</p>
        <div className="mx-auto my-5 h-1.5 w-28 rounded-full cmyk-strip" />
        <h1 className="text-2xl font-bold tracking-tight">{t('notFound.title')}</h1>
        <p className="mx-auto mt-2 max-w-md text-muted-foreground">{t('notFound.desc')}</p>

        <form onSubmit={search} className="mx-auto mt-8 flex max-w-md gap-2">
          <div className="relative flex-1">
            <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('products.searchPlaceholder')} className="h-11 pl-9" aria-label={t('common.search')} />
          </div>
          <Button type="submit" size="lg" className="h-11">
            {t('common.search')}
          </Button>
        </form>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {links.map(({ to, label, icon: Icon }) => (
            <Button key={to} variant="outline" size="sm" asChild>
              <Link to={to}>
                <Icon /> {label}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      {categories && categories.length > 0 && (
        <div className="mx-auto mt-10 max-w-5xl">
          <p className="mb-4 text-center text-sm font-medium text-muted-foreground">{t('products.browseCategories')}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((c) => (
              <Link
                key={c._id}
                to={categoryHome(c.slug)}
                className="group flex items-center gap-3 rounded-xl shadow-card bg-card p-3 text-sm font-medium transition-colors hover:border-foreground/20"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <DynamicIcon name={c.icon} className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1 leading-snug">{l(c.name)}</span>
                <IconArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
