import {
  IconCheck,
  IconClock,
  IconFilter,
  IconPackage,
  IconPlus,
  IconReceipt,
  IconSchool,
  IconSearch,
  IconShieldLock,
  IconShoppingCart,
  IconTrash,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { OptionPicker } from '@/components/common/option-picker';
import { QuantityStepper } from '@/components/common/quantity-stepper';
import { EmptyState, PageHeader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { quoteRetail } from '@/features/catalog/api';
import { useCreateWalkIn, useWalkInProducts, useWalkInTotals } from '@/features/orders/api';
import { deleteUpload, FileUploader, type LineFile } from '@/features/uploads/file-uploader';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { newIdempotencyKey } from '@/lib/api-client';
import { formatINR, formatNumber, round2, taxIncluded } from '@/lib/format';
import { en, unitLabel } from '@/lib/l10n';
import { cn } from '@/lib/utils';
import type { Product, Quote } from '@/types/api';

/** A line's price as last quoted; null while its options are not valid. */
type LinePrice = Pick<Quote, 'subtotal' | 'unitPrice' | 'units' | 'fixedFees' | 'requiresQuote'> | null;

interface Line {
  key: string;
  productId: string;
  options: Record<string, string>;
  quantity: number;
  pageCount: number;
  copies: number;
  notes: string;
  /** The customer's files, uploaded at the counter (phone, pen drive, email). */
  files: LineFile[];
  /** The customer will hand the file over later, so the order may go in without it. */
  fileLater: boolean;
}

/** File types offered when a product needs a file but lists none. */
const DEFAULT_FILE_TYPES = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
const takesFiles = (p: Product) => p.requiresUpload || p.acceptedFileTypes.length > 0;
/** Same rule as the website: a file is required unless the shop prices the job first. */
const needsFile = (p: Product) => p.requiresUpload && p.workflow !== 'quote';
const missingFile = (l: Line, p: Product) => needsFile(p) && l.files.length === 0 && !l.fileLater;
/** Pages counted from the uploaded PDFs, when every file could be read. */
const pagesFromFiles = (l: Line) =>
  l.files.length > 0 && l.files.every((f) => f.pageCount) ? l.files.reduce((s, f) => s + (f.pageCount ?? 0), 0) : null;

function newLine(product: Product): Line {
  return {
    key: crypto.randomUUID(),
    productId: product._id,
    options: Object.fromEntries(product.options.map((o) => [o.key, (o.values.find((v) => v.isDefault) ?? o.values[0])?.value ?? ''])),
    quantity: product.pricing.retail.minQty || 1,
    pageCount: product.unit === 'page' ? product.pricing.retail.minQty : 0,
    copies: 1,
    notes: '',
    files: [],
    fileLater: false,
  };
}

function ProductThumb({ product, className }: { product: Product; className?: string }) {
  return product.images[0] ? (
    <img src={product.images[0]} alt="" className={cn('rounded-lg object-cover', className)} />
  ) : (
    <span className={cn('grid place-items-center rounded-lg bg-primary/10 text-primary', className)}>
      <DynamicIcon name={product.icon} className="size-1/2" />
    </span>
  );
}

const fromPrice = (product: Product) => {
  const tiers = product.pricing.retail.tiers;
  return tiers.length ? Math.min(...tiers.map((t) => t.unitPrice)) : null;
};

function LineEditor({
  line,
  product,
  onChange,
  onRemove,
  onTotal,
  design,
  onAddAnother,
  highlighted,
}: {
  line: Line;
  product: Product;
  onChange: (l: Line) => void;
  onRemove: () => void;
  onTotal: (key: string, price: LinePrice) => void;
  /** 1, 2, 3… when the same product is in the order more than once. */
  design?: number;
  /** Another of this product with its own photos, size and quantity. */
  onAddAnother: () => void;
  highlighted?: boolean;
}) {
  const isPage = product.unit === 'page';
  const counted = isPage ? pagesFromFiles(line) : null;
  const pageCount = counted ?? line.pageCount;
  const input = useDebouncedValue(
    isPage
      ? { productId: product._id, options: line.options, pageCount, copies: line.copies }
      : { productId: product._id, options: line.options, quantity: line.quantity },
    250,
  );
  const { data: quote, isFetching } = useQuery({
    queryKey: ['walkin-quote', input],
    queryFn: () => quoteRetail(input),
  });

  useEffect(() => {
    if (quote) onTotal(line.key, quote.valid ? quote : null);
  }, [quote, line.key, onTotal]);

  return (
    <div
      id={`line-${line.key}`}
      className={cn('space-y-4 rounded-xl border bg-card p-4 transition-shadow duration-300', highlighted && 'border-primary ring-4 ring-primary/20')}
    >
      <div className="flex items-center gap-3">
        <ProductThumb product={product} className="size-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold text-brand-navy">
            <span className="truncate">{en(product.name)}</span>
            {design && <Badge variant="secondary" className="shrink-0">Design {design}</Badge>}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{en(product.category.name)}</span>
            <span className="inline-flex items-center gap-1">
              <IconClock className="size-3.5" />
              {product.leadTimeDays === 0 ? 'Same day' : `Ready in ${product.leadTimeDays} working day${product.leadTimeDays > 1 ? 's' : ''}`}
            </span>
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${en(product.name)}`}>
          <IconTrash className="size-4 text-destructive" />
        </Button>
      </div>

      {product.options.length > 0 && (
        <OptionPicker options={product.options} value={line.options} onChange={(k, v) => onChange({ ...line, options: { ...line.options, [k]: v } })} />
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-4">
        {isPage ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`${line.key}-pages`} className="text-xs">Pages per copy</Label>
              {counted !== null ? (
                <p className="flex h-10 items-center gap-1.5 rounded-xl bg-success/10 px-3 text-sm font-medium text-success">
                  <IconCheck className="size-4" /> {formatNumber(counted)} pages, counted from the files
                </p>
              ) : (
                <QuantityStepper id={`${line.key}-pages`} value={line.pageCount} onChange={(pageCount) => onChange({ ...line, pageCount })} step={10} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${line.key}-copies`} className="text-xs">Copies</Label>
              <QuantityStepper id={`${line.key}-copies`} value={line.copies} onChange={(copies) => onChange({ ...line, copies })} />
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor={`${line.key}-qty`} className="text-xs capitalize">{unitLabel(product.unit, 2)}</Label>
            <QuantityStepper
              id={`${line.key}-qty`}
              value={line.quantity}
              onChange={(quantity) => onChange({ ...line, quantity })}
              step={product.pricing.retail.minQty >= 50 ? 10 : 1}
            />
            {product.pricing.retail.minQty > 1 && (
              <p className="text-xs text-muted-foreground">
                Minimum {formatNumber(product.pricing.retail.minQty)} {unitLabel(product.unit, product.pricing.retail.minQty)}
              </p>
            )}
          </div>
        )}
      </div>
      {takesFiles(product) && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <Label className="text-xs">
              Customer's files {needsFile(product) ? <span className="text-destructive">*</span> : <span className="font-normal text-muted-foreground">(optional)</span>}
            </Label>
            {en(product.uploadHint) && <p className="text-xs text-muted-foreground">{en(product.uploadHint)}</p>}
          </div>
          {!line.fileLater && (
            <FileUploader
              productId={product._id}
              accepted={product.acceptedFileTypes.length ? product.acceptedFileTypes : DEFAULT_FILE_TYPES}
              files={line.files}
              onChange={(files) => onChange({ ...line, files })}
            />
          )}
          {needsFile(product) && line.files.length === 0 && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={line.fileLater} onCheckedChange={(v) => onChange({ ...line, fileLater: v === true })} />
              Customer will give the file later (email, WhatsApp, pen drive)
            </label>
          )}
          {missingFile(line, product) && <p className="text-xs text-destructive">Upload the customer's file, or tick that it comes later.</p>}
        </div>
      )}
      {product.sensitive && (
        <Alert variant="warning">
          <IconShieldLock />
          <AlertDescription className="text-foreground">Personal ID document: the file is kept private and deleted automatically after the order is done.</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">
          Instructions <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          value={line.notes}
          onChange={(e) => onChange({ ...line, notes: e.target.value })}
          maxLength={1000}
          className="min-h-16"
          placeholder="Name to print, colours, binding side, which pages in colour…"
        />
      </div>
      {quote?.nextTier && quote.valid && !quote.requiresQuote && (
        <p className="rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">
          Order {formatNumber(quote.nextTier.minQty)} or more for {formatINR(quote.nextTier.unitPrice)} each.
        </p>
      )}
      <div className="flex items-center justify-between text-sm">
        {quote && !quote.valid ? (
          <span className="text-destructive">{quote.errors[0]?.message}</span>
        ) : quote?.requiresQuote ? (
          <span className="text-muted-foreground">Price set later (quote)</span>
        ) : (
          <span className="text-muted-foreground">
            {quote ? `${formatINR(quote.unitPrice)} × ${quote.units}${quote.fixedFees ? ` + ${formatINR(quote.fixedFees)}` : ''}` : ''}
          </span>
        )}
        <span className="flex items-center gap-2 font-bold tabular-nums">
          {isFetching && <Spinner className="size-4" />}
          {quote?.valid ? formatINR(quote.subtotal) : '—'}
        </span>
      </div>
      <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={onAddAnother}>
        <IconPlus /> Add another {en(product.name)}
        <span className="font-normal text-muted-foreground">(different photos, size or quantity)</span>
      </Button>
    </div>
  );
}

/** Every counter product, searchable and grouped by category; a tap adds it to the order. */
function ProductBrowser({ products, counts, onPick }: { products: Product[]; counts: Map<string, number>; onPick: (p: Product) => void }) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const q = search.trim().toLowerCase();

  const categories = useMemo(() => {
    const map = new Map<string, Product['category']>();
    for (const p of products) if (!map.has(p.category._id)) map.set(p.category._id, p.category);
    return [...map.values()];
  }, [products]);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; items: Product[] }>();
    for (const p of products) {
      if (category !== 'all' && p.category._id !== category) continue;
      if (q && ![p.name.en, p.name.hi, p.category.name.en, p.slug].some((s) => s?.toLowerCase().includes(q))) continue;
      const g = map.get(p.category._id) ?? { name: en(p.category.name), items: [] };
      g.items.push(p);
      map.set(p.category._id, g);
    }
    return [...map.entries()];
  }, [products, category, q]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" className="pl-9" aria-label="Search products" />
        </div>
        {categories.length > 1 && (
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-40 shrink-0 sm:w-52" aria-label="Filter by category">
              <IconFilter className="size-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {en(c.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={<IconPackage />} title={products.length ? 'No products match your search' : 'No counter products yet'} />
      ) : (
        groups.map(([id, group]) => (
          <section key={id}>
            <h3 className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{group.name}</h3>
            <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
              {group.items.map((p) => {
                const from = fromPrice(p);
                const inOrder = counts.get(p._id) ?? 0;
                return (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => onPick(p)}
                    className={cn(
                      'group flex items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/40',
                      inOrder > 0 && 'border-primary/50 bg-primary/4',
                    )}
                  >
                    <ProductThumb product={p} className="size-12 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-sm font-semibold text-brand-navy">{en(p.name)}</span>
                      <span className="mt-0.5 block text-xs font-medium text-primary">
                        {from !== null ? `From ${formatINR(from)}/${unitLabel(p.unit, 1)}` : 'Price on quote'}
                        {p.pricing.retail.minQty > 1 && (
                          <span className="font-normal text-muted-foreground"> · Min {formatNumber(p.pricing.retail.minQty)}</span>
                        )}
                      </span>
                    </span>
                    {inOrder > 0 ? (
                      <Badge className="shrink-0 gap-1"><IconCheck className="size-3.5" /> Added{inOrder > 1 ? ` ×${inOrder}` : ""}</Badge>
                    ) : (
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                        <IconPlus className="size-4" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

export default function WalkInPage() {
  const navigate = useNavigate();
  const { data: products = [], isLoading } = useWalkInProducts();
  const productMap = useMemo(() => new Map(products.map((p) => [p._id, p])), [products]);
  const create = useCreateWalkIn();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [prices, setPrices] = useState<Record<string, LinePrice>>({});
  const [paid, setPaid] = useState('');
  const [provider, setProvider] = useState<'cash' | 'upi_counter'>('cash');
  const [note, setNote] = useState('');
  // One key per walk-in form: a double click or retry never creates the order twice.
  const orderKey = useRef(newIdempotencyKey());
  const itemsRef = useRef<HTMLDivElement>(null);
  /** The line just added or pointed to, outlined for a moment. */
  const [flash, setFlash] = useState<string | null>(null);

  const handleTotal = useCallback((key: string, value: LinePrice) => setPrices((t) => ({ ...t, [key]: value })), []);
  const active = lines.filter((l) => productMap.has(l.productId));
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lines) map.set(l.productId, (map.get(l.productId) ?? 0) + 1);
    return map;
  }, [lines]);
  const subtotal = round2(active.reduce((sum, l) => sum + (prices[l.key]?.subtotal ?? 0), 0));
  const filesMissing = active.filter((l) => missingFile(l, productMap.get(l.productId)!));
  const allValid = active.length > 0 && active.every((l) => prices[l.key]) && filesMissing.length === 0;
  const filesLater = active.filter((l) => l.fileLater && l.files.length === 0).map((l) => en(productMap.get(l.productId)!.name));
  const { data: bill } = useWalkInTotals(subtotal);
  const total = bill?.subtotal === subtotal ? bill.total : subtotal;
  const paidAmount = Math.max(0, Number(paid) || 0);
  const balance = Math.max(0, round2(total - paidAmount));
  const phoneValid = /^[6-9]\d{9}$/.test(phone);
  const emailValid = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  /** A second design of the same product, right under the first: same choices, fresh photos and instructions. */
  const addAnother = (line: Line) => {
    const copy: Line = { ...line, key: crypto.randomUUID(), files: [], fileLater: false, notes: '' };
    setLines((ls) => {
      const i = ls.findIndex((l) => l.key === line.key);
      return [...ls.slice(0, i + 1), copy, ...ls.slice(i + 1)];
    });
    showLine(copy.key);
  };
  const designOf = (line: Line) => {
    const same = active.filter((l) => l.productId === line.productId);
    return same.length > 1 ? same.indexOf(line) + 1 : undefined;
  };

  /** Brings a line into view and outlines it for a moment. */
  const showLine = (key: string) => {
    setFlash(key);
    requestAnimationFrame(() => document.getElementById(`line-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    window.setTimeout(() => setFlash((k) => (k === key ? null : k)), 1600);
  };

  const addProduct = async (p: Product) => {
    // Already in the order: say so first, then let staff add another design or go to the one there.
    const existing = active.filter((l) => l.productId === p._id);
    if (existing.length > 0) {
      const last = existing.at(-1)!;
      const another = await confirmAction({
        title: `${en(p.name)} is already in this order`,
        description:
          existing.length === 1
            ? 'Add another one with different photos, size or quantity? It will be Design 2 in the same order.'
            : `There are ${existing.length} designs already. Add Design ${existing.length + 1} with its own photos, size or quantity?`,
        confirmLabel: 'Add another design',
        cancelLabel: 'Show the added one',
      });
      if (another) addAnother(last);
      else showLine(last.key);
      return;
    }
    const line = newLine(p);
    setLines((ls) => [...ls, line]);
    // On phones the order list sits above the products; bring the new line into view.
    showLine(line.key);
  };

  const submit = async () => {
    let orderId = '';
    const ok = await confirmAction({
      title: `Create a walk-in order for ${name.trim() || `+91 ${phone}`}?`,
      description: `${active.length} item${active.length > 1 ? 's' : ''}, total ${formatINR(total)}, ${Number(paid) > 0 ? `${formatINR(Number(paid))} paid now` : 'nothing paid yet'}.`,
      confirmLabel: 'Create order',
      action: async () => {
        const order = await create.mutateAsync({
          key: orderKey.current,
          customer: { name: name.trim(), phone, email: email.trim().toLowerCase() || undefined },
          items: active.map((l) => {
            const product = productMap.get(l.productId)!;
            return {
              productId: l.productId,
              options: l.options,
              ...(product.unit === 'page' ? { pageCount: pagesFromFiles(l) ?? l.pageCount, copies: l.copies } : { quantity: l.quantity }),
              notes: l.notes || undefined,
              fileIds: l.files.map((f) => f.id),
            };
          }),
          fulfilment: { method: 'pickup' },
          amountPaid: Number(paid) || 0,
          paymentProvider: provider,
          // Staff see on the order that a file is still to come.
          internalNote: [filesLater.length ? `File to come from the customer: ${filesLater.join(', ')}` : '', note.trim()].filter(Boolean).join('\n') || undefined,
        });
        orderId = order._id;
      },
      successTitle: 'Order created',
    });
    if (ok && orderId) navigate(`/orders/${orderId}`);
  };

  return (
    <div>
      <PageHeader icon={<IconReceipt />}
        title="Walk-in order"
        description="Enter counter orders so every job lives in one system. Uses individual prices."
        actions={
          <Button variant="outline" asChild>
            <Link to="/orders/school">
              <IconSchool /> For a school or college
            </Link>
          </Button>
        }
      />
      <div className="grid items-start gap-6 *:min-w-0 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Mobile</Label>
                <Input id="phone" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="email">
                  Email <span className="font-normal text-muted-foreground">(optional, for order updates)</span>
                </Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!emailValid} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Order items{active.length > 0 && <span className="ml-1.5 font-normal text-muted-foreground">({active.length})</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {active.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
                  <IconShoppingCart className="size-6 text-muted-foreground" />
                  <p className="text-sm font-medium">No items yet</p>
                  <p className="text-xs text-muted-foreground">Tap a product below to add it to this order.</p>
                </div>
              ) : (
                <div ref={itemsRef} className="space-y-3">
                  {active.map((line) => (
                    <LineEditor
                      key={line.key}
                      line={line}
                      product={productMap.get(line.productId)!}
                      onChange={(next) => setLines((ls) => ls.map((l) => (l.key === line.key ? next : l)))}
                      onRemove={() => {
                        line.files.forEach((f) => void deleteUpload(f.id));
                        setLines((ls) => ls.filter((l) => l.key !== line.key));
                      }}
                      onTotal={handleTotal}
                      design={designOf(line)}
                      onAddAnother={() => addAnother(line)}
                      highlighted={flash === line.key}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add products</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Spinner /> : <ProductBrowser products={products} counts={counts} onPick={addProduct} />}
            </CardContent>
          </Card>
        </div>

        <Card id="walkin-summary" className="scroll-mt-20 xl:sticky xl:top-24 xl:self-start">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {active.length > 0 && (
              <ul className="space-y-3 text-sm">
                {active.map((l) => {
                  const product = productMap.get(l.productId)!;
                  const price = prices[l.key];
                  return (
                    <li key={l.key}>
                      <div className="flex justify-between gap-3">
                        <span className="truncate font-medium">
                          {en(product.name)}
                          {designOf(l) && <span className="text-muted-foreground"> · Design {designOf(l)}</span>}
                        </span>
                        <span className="shrink-0 font-semibold tabular-nums">{price ? formatINR(price.subtotal) : '—'}</span>
                      </div>
                      {price && !price.requiresQuote && (
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {formatINR(price.unitPrice)} / {unitLabel(product.unit, 1)} × {formatNumber(price.units)}
                          {price.fixedFees > 0 && ` + ${formatINR(price.fixedFees)} extras`}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <dl className="space-y-1.5 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatINR(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Pickup at shop</dt>
                <dd className="tabular-nums">{bill && bill.deliveryFee > 0 ? formatINR(bill.deliveryFee) : 'Free'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  {bill && bill.taxRate > 0 ? `GST (${bill.taxRate}%)` : 'GST'}
                  {bill && taxIncluded(bill) && <span className="ml-1 text-xs">(included)</span>}
                </dt>
                <dd className="tabular-nums">{bill && bill.tax > 0 && bill.subtotal === subtotal ? formatINR(bill.tax) : '—'}</dd>
              </div>
              <div className="flex items-end justify-between pt-1.5">
                <dt className="font-semibold">Total</dt>
                <dd className="text-2xl font-bold tabular-nums">{formatINR(total)}</dd>
              </div>
            </dl>
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="paid">Amount received now</Label>
              <div className="flex gap-2">
                <Input id="paid" type="number" min={0} max={total} placeholder="0" value={paid} onChange={(e) => setPaid(e.target.value)} />
                <Select value={provider} onValueChange={(v) => setProvider(v as 'cash' | 'upi_counter')}>
                  <SelectTrigger className="w-28" aria-label="Payment method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi_counter">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* A shortcut that fills in the whole bill; nothing is marked paid until the order is created. */}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={total <= 0 || paidAmount === total} onClick={() => setPaid(String(total))}>
                  Full amount {total > 0 && formatINR(total)}
                </Button>
                {paidAmount > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setPaid('')}>
                    Clear
                  </Button>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Balance due</span>
                <span className={cn('font-semibold tabular-nums', balance > 0 ? 'text-warning' : 'text-success')}>
                  {total > 0 && balance === 0 ? 'Fully paid' : formatINR(balance)}
                </span>
              </div>
              {paidAmount > total && <p className="text-xs text-destructive">More than the total; only {formatINR(total)} will be recorded.</p>}
            </div>
            <div className="space-y-2">
              <Label>Internal note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
            </div>
            <Button className="w-full" size="lg" disabled={!name.trim() || !phoneValid || !emailValid || !allValid || create.isPending} onClick={() => void submit()}>
              {create.isPending ? <Spinner className="size-4 text-current" /> : <IconReceipt />} Create order
            </Button>
            {filesMissing.length > 0 && (
              <p className="text-xs text-destructive">
                Add the customer's file for {filesMissing.map((l) => en(productMap.get(l.productId)!.name)).join(', ')}, or tick that it comes later.
              </p>
            )}
            {!phoneValid && phone.length > 0 && <p className="text-xs text-destructive">Enter a valid 10-digit mobile number.</p>}
          </CardContent>
        </Card>
      </div>

      {/* Below 1280px the summary sits under the items: the running total stays in view, and one tap
          goes to the summary to take the payment and create the order. */}
      {active.length > 0 && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-4 flex items-center gap-3 rounded-xl border bg-card/95 px-4 py-2.5 backdrop-blur-xl md:bottom-3 xl:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {active.length} item{active.length > 1 ? 's' : ''}
              {filesMissing.length > 0 && <span className="text-destructive"> · file needed</span>}
            </p>
            <p className="text-lg font-bold tabular-nums">{formatINR(total)}</p>
          </div>
          <Button onClick={() => document.getElementById('walkin-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            <IconReceipt /> Review &amp; pay
          </Button>
        </div>
      )}
    </div>
  );
}
