import { IconPencil, IconPlus, IconSearch, IconTagsOff } from '@tabler/icons-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAdminCategories, useAdminProducts, useToggleProduct, type AdminProduct } from '@/features/catalog/api';
import { missingForProduct } from '@/features/catalog/completeness';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatINR } from '@/lib/format';
import { en, unitLabel } from '@/lib/l10n';
import type { PriceBook } from '@/types/api';

function BookSummary({ book, unit }: { book: PriceBook; unit: string }) {
  if (!book.enabled) return <span className="text-xs text-muted-foreground">Off</span>;
  if (!book.tiers.length) return <Badge variant="soft">Quote</Badge>;
  const min = Math.min(...book.tiers.map((t) => t.unitPrice));
  return (
    <div className="text-sm">
      <span className="font-semibold tabular-nums">{formatINR(min)}</span>
      <span className="text-xs text-muted-foreground"> /{unitLabel(unit, 1)}</span>
      <p className="text-xs text-muted-foreground">
        min {book.minQty} · {book.tiers.length} tier{book.tiers.length > 1 ? 's' : ''}
      </p>
    </div>
  );
}

/** Green when the product page is complete; otherwise lists what is missing. */
function Completeness({ product }: { product: AdminProduct }) {
  const missing = missingForProduct(product);
  if (!missing.length) return <Badge variant="success">Complete</Badge>;
  return (
    <div className="max-w-48 space-y-1">
      <Badge variant="warning">{missing.length} to finish</Badge>
      <p className="text-xs leading-snug text-muted-foreground">{missing.join(' · ')}</p>
    </div>
  );
}

export default function ProductsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const q = useDebouncedValue(search.trim(), 300) || undefined;
  const { data: categories } = useAdminCategories();
  const { data, isLoading, error, refetch } = useAdminProducts({ q, category: category === 'all' ? undefined : category });
  const toggle = useToggleProduct();

  const setActive = (p: AdminProduct, isActive: boolean) =>
    void confirmAction({
      tone: isActive ? 'default' : 'danger',
      title: isActive ? `Show “${en(p.name)}” on the website?` : `Hide “${en(p.name)}” from the website?`,
      description: isActive ? 'Customers will be able to find and order it again.' : 'Customers will no longer see or order it. Existing orders are not affected.',
      confirmLabel: isActive ? 'Show product' : 'Hide product',
      action: () => toggle.mutateAsync({ id: p._id, isActive }),
      successTitle: isActive ? 'Product is live' : 'Product hidden',
    });

  return (
    <div>
      <PageHeader
        title="Products & prices"
        description="Each product has an individual and an institution price book."
        actions={
          <Button asChild>
            <Link to="/products/new">
              <IconPlus /> New product
            </Link>
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories?.map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {en(c.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Card className="gap-0 py-0">
          {isLoading ? (
            <div className="grid h-64 place-items-center">
              <Spinner />
            </div>
          ) : data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Product</TableHead>
                  <TableHead className="hidden lg:table-cell">Workflow</TableHead>
                  <TableHead>Individual price</TableHead>
                  <TableHead>Institution price</TableHead>
                  <TableHead className="hidden md:table-cell">Ready</TableHead>
                  <TableHead>Visible</TableHead>
                  <TableHead className="pr-5" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="pl-5">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                          <DynamicIcon name={p.icon} className="size-5" />
                        </span>
                        <div>
                          <p className="font-medium">{en(p.name)}</p>
                          <p className="text-xs text-muted-foreground">
                            {en(p.category?.name)} {p.isFeatured && '· ★ featured'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="outline" className="capitalize">{p.workflow}</Badge>
                    </TableCell>
                    <TableCell>
                      <BookSummary book={p.pricing.retail} unit={p.unit} />
                    </TableCell>
                    <TableCell>
                      <BookSummary book={p.pricing.institution} unit={p.unit} />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Completeness product={p} />
                    </TableCell>
                    <TableCell>
                      <Switch checked={p.isActive} onCheckedChange={(v) => setActive(p, v)} aria-label="Visible on website" />
                    </TableCell>
                    <TableCell className="pr-5 text-right">
                      <Button variant="outline" size="sm" onClick={() => navigate(`/products/${p._id}`)}>
                        <IconPencil /> Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState icon={<IconTagsOff />} title="No products" />
          )}
        </Card>
      )}
    </div>
  );
}
