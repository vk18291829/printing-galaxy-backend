import { IconAlertTriangle, IconBoxSeam, IconHistory, IconPencil, IconPlus, IconTransferIn } from '@tabler/icons-react';
import { useState } from 'react';
import { MobileList, MobileRow } from '@/components/common/mobile-list';
import { confirmAction } from '@/components/common/confirm-dialog';
import { EmptyState, ErrorState, PageHeader, PageLoader, Spinner } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useCan } from '@/features/auth/auth-store';
import {
  useArchiveMaterial,
  useMaterials,
  useMovements,
  useRecordMovement,
  useSaveMaterial,
  type MaterialInput,
} from '@/features/operations/api';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Material, MaterialUnit, MovementReason } from '@/types/admin';

const UNITS: MaterialUnit[] = ['sheets', 'cards', 'pcs', 'rolls', 'packs', 'ml', 'kg', 'm'];
const REASONS: { value: MovementReason; label: string; hint: string }[] = [
  { value: 'purchase', label: 'Stock received', hint: 'Adds to stock' },
  { value: 'usage', label: 'Used for jobs', hint: 'Removes from stock' },
  { value: 'wastage', label: 'Wasted / damaged', hint: 'Removes from stock' },
  { value: 'correction', label: 'Stock count', hint: 'Sets the counted total' },
];

function MaterialDialog({ material, onClose }: { material: Material | 'new'; onClose: () => void }) {
  const save = useSaveMaterial();
  const archive = useArchiveMaterial();
  const isNew = material === 'new';
  const [form, setForm] = useState<MaterialInput>(
    isNew
      ? { name: '', unit: 'sheets', lowStockThreshold: 0, quantity: 0 }
      : {
          name: material.name,
          sku: material.sku,
          unit: material.unit,
          lowStockThreshold: material.lowStockThreshold,
          reorderQuantity: material.reorderQuantity,
          supplier: material.supplier,
          notes: material.notes,
        },
  );
  const set = <K extends keyof MaterialInput>(key: K, value: MaterialInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const num = (v: string) => (v === '' ? undefined : Number(v));

  const submit = async () => {
    const ok = await confirmAction({
      title: isNew ? `Add “${form.name || 'this material'}” to stock?` : `Save changes to “${form.name}”?`,
      description: isNew ? 'It starts tracking stock from the quantity you entered.' : 'Name, unit and alert levels are updated. Use “Record stock” to change the quantity.',
      confirmLabel: isNew ? 'Add material' : 'Save changes',
      action: () => save.mutateAsync({ id: isNew ? undefined : material._id, data: form }),
      successTitle: isNew ? 'Material added' : 'Changes saved',
    });
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add material' : `Edit ${material.name}`}</DialogTitle>
          <DialogDescription>When stock falls to the alert level, the shop gets one alert.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="PVC card sheets (A4, 760 micron)" />
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <Select value={form.unit} onValueChange={(v) => set('unit', v as MaterialUnit)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Code / SKU (optional)</Label>
            <Input value={form.sku ?? ''} onChange={(e) => set('sku', e.target.value || undefined)} />
          </div>
          {isNew && (
            <div className="space-y-1.5">
              <Label>Opening stock</Label>
              <Input type="number" min={0} value={form.quantity ?? 0} onChange={(e) => set('quantity', Number(e.target.value))} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Alert when at or below</Label>
            <Input type="number" min={0} value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Usual reorder quantity</Label>
            <Input type="number" min={0} value={form.reorderQuantity ?? ''} onChange={(e) => set('reorderQuantity', num(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Input value={form.supplier ?? ''} onChange={(e) => set('supplier', e.target.value || undefined)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} className="min-h-16" />
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          {!isNew ? (
            <Button
              variant="danger"
              
              disabled={archive.isPending}
              onClick={async () => {
                const ok = await confirmAction({
                  tone: 'danger',
                  title: `Archive “${material.name}”?`,
                  description: 'It disappears from the stock list and low-stock alerts. Its stock history is kept.',
                  confirmLabel: 'Archive material',
                  action: () => archive.mutateAsync(material._id),
                  successTitle: 'Material archived',
                });
                if (ok) onClose();
              }}
            >
              Archive
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={save.isPending || !form.name.trim()}>
              {save.isPending && <Spinner className="size-4 text-current" />} Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementDialog({ material, onClose }: { material: Material; onClose: () => void }) {
  const record = useRecordMovement();
  const [reason, setReason] = useState<MovementReason>('usage');
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const qty = Number(quantity);
  const after =
    reason === 'correction' ? qty : reason === 'purchase' ? material.quantity + Math.abs(qty) : material.quantity - Math.abs(qty);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{material.name}</DialogTitle>
          <DialogDescription>
            In stock: {formatNumber(material.quantity)} {material.unit}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              className={cn(
                'rounded-xl shadow-card px-3 py-2 text-left text-sm transition-colors',
                reason === r.value && 'border-primary bg-primary/5',
              )}
            >
              <span className="block font-medium">{r.label}</span>
              <span className="text-xs text-muted-foreground">{r.hint}</span>
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label>{reason === 'correction' ? `Counted total (${material.unit})` : `Quantity (${material.unit})`}</Label>
          <Input type="number" min={0} autoFocus value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          {quantity !== '' && (
            <p className={cn('text-xs', after < 0 ? 'text-destructive' : 'text-muted-foreground')}>
              Stock after: {formatNumber(after)} {material.unit}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Note (optional)</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={reason === 'purchase' ? 'Bill no., supplier' : 'Order no., reason'} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={record.isPending || quantity === '' || (reason !== 'correction' && qty === 0)}
            onClick={async () => {
              const amount = reason === 'correction' ? qty : Math.abs(qty);
              const ok = await confirmAction({
                title: `Record ${reason === 'correction' ? 'a correction' : reason} for “${material.name}”?`,
                description: `Stock goes from ${formatNumber(material.quantity)} to ${formatNumber(after)} ${material.unit}. This is added to the stock history.`,
                confirmLabel: 'Record stock',
                action: () => record.mutateAsync({ id: material._id, quantity: amount, reason, note: note || undefined }),
                successTitle: 'Stock updated',
              });
              if (ok) onClose();
            }}
          >
            {record.isPending && <Spinner className="size-4 text-current" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistorySheet({ material, onClose }: { material: Material; onClose: () => void }) {
  const { data, isLoading } = useMovements(material._id);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{material.name}</SheetTitle>
          <SheetDescription>Last 50 stock changes</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {isLoading ? (
            <Spinner />
          ) : data?.length ? (
            <ul className="divide-y">
              {data.map((m) => (
                <li key={m._id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium">{REASONS.find((r) => r.value === m.reason)?.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(m.createdAt, 'en', true)}
                      {m.by?.name ? ` · ${m.by.name}` : ''}
                    </p>
                    {m.note && <p className="mt-0.5 truncate text-xs">{m.note}</p>}
                  </div>
                  <div className="text-right tabular-nums">
                    <p className={cn('font-semibold', m.delta > 0 ? 'text-success' : 'text-destructive')}>
                      {m.delta > 0 ? '+' : ''}
                      {formatNumber(m.delta)}
                    </p>
                    <p className="text-xs text-muted-foreground">→ {formatNumber(m.balance)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function InventoryPage() {
  const isAdmin = useCan('inventory');
  const { data, isLoading, error, refetch } = useMaterials();
  const [editing, setEditing] = useState<Material | 'new' | null>(null);
  const [moving, setMoving] = useState<Material | null>(null);
  const [history, setHistory] = useState<Material | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const items = data.filter((m) => showArchived || m.isActive);
  const low = data.filter((m) => m.low);

  return (
    <div>
      <PageHeader
        title="Materials & stock"
        description="PVC sheets, paper, lamination, ink and blanks. Record what comes in and what gets used."
        actions={
          isAdmin && (
            <Button onClick={() => setEditing('new')}>
              <IconPlus /> Add material
            </Button>
          )
        }
      />

      {low.length > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl shadow-card border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          <IconAlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-warning" />
          <p>
            <span className="font-semibold">Running low:</span> {low.map((m) => `${m.name} (${formatNumber(m.quantity)} ${m.unit})`).join(', ')}
          </p>
        </div>
      )}

      <Card className="gap-0 py-0">
        {items.length === 0 ? (
          <EmptyState
            icon={<IconBoxSeam />}
            title="No materials yet"
            description={isAdmin ? 'Add the consumables you want to keep an eye on.' : 'Ask the owner to add materials.'}
          />
        ) : (
          <>
          <MobileList>
            {items.map((m) => (
              <MobileRow
                key={m._id}
                onClick={m.isActive ? () => setMoving(m) : () => setHistory(m)}
                title={<span className={cn(!m.isActive && 'text-muted-foreground')}>{m.name}</span>}
                subtitle={`${m.sku ? `${m.sku} · ` : ''}${m.supplier ? `${m.supplier} · ` : ''}updated ${formatDate(m.updatedAt)}${m.isActive ? '' : ' · archived'}`}
                trailing={
                  <span className="whitespace-nowrap">
                    <span className={cn('font-semibold tabular-nums', m.low && 'text-destructive')}>{formatNumber(m.quantity)}</span>{' '}
                    <span className="text-xs text-muted-foreground">{m.unit}</span>
                  </span>
                }
                meta={
                  <>
                    {m.low && <Badge variant="warning">Low</Badge>}
                    {m.lowStockThreshold > 0 && <span className="tabular-nums">Alert at {formatNumber(m.lowStockThreshold)}</span>}
                  </>
                }
                actions={[
                  ...(m.isActive ? [{ label: 'Update stock', icon: <IconTransferIn />, onSelect: () => setMoving(m) }] : []),
                  { label: 'History', icon: <IconHistory />, onSelect: () => setHistory(m) },
                  ...(isAdmin ? [{ label: 'Edit material', icon: <IconPencil />, onSelect: () => setEditing(m) }] : []),
                ]}
              />
            ))}
          </MobileList>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Material</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Alert at</TableHead>
                <TableHead className="hidden md:table-cell">Supplier</TableHead>
                <TableHead className="pr-5 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <TableRow key={m._id} className={cn(!m.isActive && 'opacity-50')}>
                  <TableCell className="pl-5">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.sku ? `${m.sku} · ` : ''}updated {formatDate(m.updatedAt)}
                      {!m.isActive && ' · archived'}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn('font-semibold tabular-nums', m.low && 'text-destructive')}>
                      {formatNumber(m.quantity)}
                    </span>{' '}
                    <span className="text-xs text-muted-foreground">{m.unit}</span>
                    {m.low && (
                      <Badge variant="warning" className="ml-2">
                        Low
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right text-sm text-muted-foreground tabular-nums sm:table-cell">
                    {m.lowStockThreshold > 0 ? formatNumber(m.lowStockThreshold) : '—'}
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">{m.supplier || '—'}</TableCell>
                  <TableCell className="pr-5">
                    <div className="flex justify-end gap-1">
                      {m.isActive && (
                        <Button variant="outline" size="sm" onClick={() => setMoving(m)}>
                          <IconTransferIn /> <span className="hidden sm:inline">Update stock</span>
                        </Button>
                      )}
                      <Button variant="outline" size="icon" className="size-8" onClick={() => setHistory(m)} aria-label="History">
                        <IconHistory />
                      </Button>
                      {isAdmin && (
                        <Button variant="outline" size="icon" className="size-8" onClick={() => setEditing(m)} aria-label="Edit">
                          <IconPencil />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
          </>
        )}
      </Card>
      {data.some((m) => !m.isActive) && (
        <button className="mt-3 text-sm text-muted-foreground hover:text-foreground" onClick={() => setShowArchived((v) => !v)}>
          {showArchived ? 'Hide archived' : 'Show archived'}
        </button>
      )}

      {editing && <MaterialDialog material={editing} onClose={() => setEditing(null)} />}
      {moving && <MovementDialog material={moving} onClose={() => setMoving(null)} />}
      {history && <HistorySheet material={history} onClose={() => setHistory(null)} />}
    </div>
  );
}
