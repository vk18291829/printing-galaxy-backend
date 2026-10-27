import { IconPlus, IconReceipt, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { PageHeader, Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { quoteRetail, useAdminProducts, type AdminProduct } from '@/features/catalog/api';
import { useCreateWalkIn } from '@/features/orders/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { newIdempotencyKey } from '@/lib/api-client';
import { formatINR } from '@/lib/format';
import { en, unitLabel } from '@/lib/l10n';

interface Line {
  key: string;
  productId: string;
  options: Record<string, string>;
  quantity: number;
  pageCount: number;
  copies: number;
  notes: string;
}

function newLine(product?: AdminProduct): Line {
  return {
    key: crypto.randomUUID(),
    productId: product?._id ?? '',
    options: product
      ? Object.fromEntries(product.options.map((o) => [o.key, (o.values.find((v) => v.isDefault) ?? o.values[0])?.value ?? '']))
      : {},
    quantity: product?.pricing.retail.minQty ?? 1,
    pageCount: product?.unit === 'page' ? product.pricing.retail.minQty : 0,
    copies: 1,
    notes: '',
  };
}

function LineEditor({
  line,
  products,
  onChange,
  onRemove,
  onTotal,
}: {
  line: Line;
  products: AdminProduct[];
  onChange: (l: Line) => void;
  onRemove: () => void;
  onTotal: (key: string, total: number | null) => void;
}) {
  const product = products.find((p) => p._id === line.productId);
  const isPage = product?.unit === 'page';
  const input = useDebouncedValue(
    product
      ? isPage
        ? { productId: product._id, options: line.options, pageCount: line.pageCount, copies: line.copies }
        : { productId: product._id, options: line.options, quantity: line.quantity }
      : null,
    250,
  );
  const { data: quote, isFetching } = useQuery({
    queryKey: ['walkin-quote', input],
    queryFn: () => quoteRetail(input!),
    enabled: Boolean(input),
  });

  useEffect(() => {
    if (quote) onTotal(line.key, quote.valid ? quote.subtotal : null);
  }, [quote, line.key, onTotal]);

  return (
    <div className="space-y-4 rounded-xl shadow-card p-4">
      <div className="flex gap-2">
        <Select value={line.productId} onValueChange={(id) => onChange({ ...newLine(products.find((p) => p._id === id)), key: line.key })}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Choose product" />
          </SelectTrigger>
          <SelectContent>
            {products.map((p) => (
              <SelectItem key={p._id} value={p._id}>
                {en(p.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="danger" size="icon" onClick={onRemove} aria-label="Remove line">
          <IconTrash className="size-4" />
        </Button>
      </div>

      {product && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {product.options.map((o) => (
              <div key={o.key} className="space-y-1.5">
                <Label className="text-xs">{en(o.label)}</Label>
                <Select value={line.options[o.key]} onValueChange={(v) => onChange({ ...line, options: { ...line.options, [o.key]: v } })}>
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {o.values.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {en(v.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            {isPage ? (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Pages per copy</Label>
                  <Input className="h-8" type="number" min={1} value={line.pageCount} onChange={(e) => onChange({ ...line, pageCount: Number(e.target.value) })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Copies</Label>
                  <Input className="h-8" type="number" min={1} value={line.copies} onChange={(e) => onChange({ ...line, copies: Number(e.target.value) })} />
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity ({unitLabel(product.unit, 2)})</Label>
                <Input className="h-8" type="number" min={1} value={line.quantity} onChange={(e) => onChange({ ...line, quantity: Number(e.target.value) })} />
              </div>
            )}
          </div>
          <Input value={line.notes} onChange={(e) => onChange({ ...line, notes: e.target.value })} placeholder="Instructions (name to print, colours…)" />
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
        </>
      )}
    </div>
  );
}

export default function WalkInPage() {
  const navigate = useNavigate();
  const { data: allProducts, isLoading } = useAdminProducts({ status: 'active' });
  const products = useMemo(() => (allProducts ?? []).filter((p) => p.pricing.retail.enabled), [allProducts]);
  const create = useCreateWalkIn();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [totals, setTotals] = useState<Record<string, number | null>>({});
  const [paid, setPaid] = useState('');
  const [provider, setProvider] = useState<'cash' | 'upi_counter'>('cash');
  const [note, setNote] = useState('');
  // One key per walk-in form: a double click or retry never creates the order twice.
  const orderKey = useRef(newIdempotencyKey());

  const handleTotal = useCallback((key: string, value: number | null) => setTotals((t) => ({ ...t, [key]: value })), []);
  const active = lines.filter((l) => l.productId);
  const total = active.reduce((sum, l) => sum + (totals[l.key] ?? 0), 0);
  const allValid = active.length > 0 && active.every((l) => totals[l.key] !== null && totals[l.key] !== undefined);
  const phoneValid = /^[6-9]\d{9}$/.test(phone);
  const emailValid = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

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
            const product = products.find((p) => p._id === l.productId)!;
            return {
              productId: l.productId,
              options: l.options,
              ...(product.unit === 'page' ? { pageCount: l.pageCount, copies: l.copies } : { quantity: l.quantity }),
              notes: l.notes || undefined,
              fileIds: [],
            };
          }),
          fulfilment: { method: 'pickup' },
          amountPaid: Number(paid) || 0,
          paymentProvider: provider,
          internalNote: note || undefined,
        });
        orderId = order._id;
      },
      successTitle: 'Order created',
    });
    if (ok && orderId) navigate(`/orders/${orderId}`);
  };

  return (
    <div>
      <PageHeader title="Walk-in order" description="Enter counter orders so every job lives in one system. Uses individual prices." />
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
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Items</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setLines((l) => [...l, newLine()])}>
                <IconPlus /> Add item
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <Spinner />
              ) : (
                lines.map((line) => (
                  <LineEditor
                    key={line.key}
                    line={line}
                    products={products}
                    onChange={(next) => setLines((ls) => ls.map((l) => (l.key === line.key ? next : l)))}
                    onRemove={() => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== line.key) : [newLine()]))}
                    onTotal={handleTotal}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-24 xl:self-start">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="text-2xl font-bold tabular-nums">{formatINR(total)}</span>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>Paid now</Label>
              <div className="flex gap-2">
                <Input type="number" min={0} placeholder="0" value={paid} onChange={(e) => setPaid(e.target.value)} />
                <Select value={provider} onValueChange={(v) => setProvider(v as 'cash' | 'upi_counter')}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi_counter">UPI</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setPaid(String(total))}>
                Paid in full
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Internal note</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16" />
            </div>
            <Button className="w-full" size="lg" disabled={!name.trim() || !phoneValid || !emailValid || !allValid || create.isPending} onClick={() => void submit()}>
              {create.isPending ? <Spinner className="size-4 text-current" /> : <IconReceipt />} Create order
            </Button>
            {!phoneValid && phone.length > 0 && <p className="text-xs text-destructive">Enter a valid 10-digit mobile number.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
