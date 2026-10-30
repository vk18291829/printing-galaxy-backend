import { IconAlertCircle, IconFiles, IconMessage, IconSettings, IconStack2 } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { QuantityStepper } from '@/components/common/quantity-stepper';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useProduct, useQuote, type QuoteInput } from '@/features/catalog/api';
import { OptionPicker } from '@/features/catalog/components/option-picker';
import { QuantityPrices } from '@/features/catalog/components/quantity-prices';
import { FileUploader } from '@/features/uploads/file-uploader';
import { deleteUpload } from '@/features/uploads/upload-file';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { useCartStore, type CartFile, type CartItem } from '../cart-store';

/** One part of the dialog: a small icon heading, then its fields; parts are split by a hairline. */
function Block({ icon, title, hint, children }: { icon: ReactNode; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3.5 border-t pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-navy text-white [&_svg]:size-4">{icon}</span>
        <div className="min-w-0">
          <p className="font-semibold text-brand-navy">{title}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * Change everything about a cart item in place: options, quantity, the uploaded files and the
 * instructions, priced live. Files removed here are deleted only once the change is saved, and
 * files added are deleted again if the change is cancelled, so Cancel leaves the item untouched.
 */
export function EditItemDialog({ item, open, onOpenChange }: { item: CartItem; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const update = useCartStore((s) => s.update);
  const { data: product, isLoading } = useProduct(open ? item.slug : '');

  const [options, setOptions] = useState(item.options);
  const [quantity, setQuantity] = useState(item.quantity ?? 1);
  const [copies, setCopies] = useState(item.copies ?? 1);
  const [pages, setPages] = useState(item.pageCount ?? 1);
  const [files, setFiles] = useState<CartFile[]>(item.files);
  const [notes, setNotes] = useState(item.notes ?? '');
  const saved = useRef(false);
  // Every time it opens, start from what is in the cart now.
  useEffect(() => {
    if (!open) return;
    saved.current = false;
    setOptions(item.options);
    setQuantity(item.quantity ?? 1);
    setCopies(item.copies ?? 1);
    setPages(item.pageCount ?? 1);
    setFiles(item.files);
    setNotes(item.notes ?? '');
  }, [open, item]);

  const isPage = item.unit === 'page';
  // Pages counted from the uploaded PDFs, as on the product page.
  const pagesFromFiles = isPage && files.length > 0 && files.every((f) => f.pageCount) ? files.reduce((n, f) => n + (f.pageCount ?? 0), 0) : null;
  const input = useMemo<QuoteInput | null>(
    () =>
      product
        ? isPage
          ? { productId: product._id, options, pageCount: pagesFromFiles ?? pages, copies }
          : { productId: product._id, options, quantity }
        : null,
    [product, isPage, options, pagesFromFiles, pages, copies, quantity],
  );
  const debounced = useDebouncedValue(input, 250);
  const { data: quote, isFetching } = useQuote(debounced);
  const stale = debounced !== input;
  const error = quote && !quote.valid ? quote.errors[0] : undefined;
  const takesFiles = Boolean(product && (product.requiresUpload || product.acceptedFileTypes.length > 0));
  const missingFile = Boolean(product?.requiresUpload) && files.length === 0;

  const close = (next: boolean) => {
    if (!next && !saved.current) {
      // Cancelled: uploads made in this dialog are not kept.
      const kept = new Set(item.files.map((f) => f.id));
      files.filter((f) => !kept.has(f.id)).forEach((f) => void deleteUpload(f.id).catch(() => undefined));
    }
    onOpenChange(next);
  };

  const save = async () => {
    const ok = await confirmAction({
      title: t('confirm.saveItemTitle', { name: l(item.name) }),
      description: t('confirm.saveItemDesc'),
      confirmLabel: t('confirm.saveChanges'),
    });
    if (!ok) return;
    const now = new Set(files.map((f) => f.id));
    item.files.filter((f) => !now.has(f.id)).forEach((f) => void deleteUpload(f.id).catch(() => undefined));
    update(item.id, {
      options,
      optionLabels: quote?.selectedOptions.map((o) => ({ label: o.label, value: o.valueLabel })) ?? item.optionLabels,
      ...(isPage ? { pageCount: pagesFromFiles ?? pages, copies } : { quantity }),
      files,
      notes: notes.trim() || undefined,
      estimate: quote?.subtotal ?? item.estimate,
    });
    saved.current = true;
    toast.success(t('cart.updated', { name: l(item.name) }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('cart.editTitle', { name: l(item.name) })}</DialogTitle>
          <DialogDescription>{t('cart.editDescAll')}</DialogDescription>
        </DialogHeader>

        {isLoading || !product ? (
          <div className="grid h-40 place-items-center">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-5">
            {product.options.length > 0 && (
              <Block icon={<IconSettings />} title={t('cart.editOptions')}>
                <OptionPicker options={product.options} value={options} onChange={(k, v) => setOptions((o) => ({ ...o, [k]: v }))} />
              </Block>
            )}

            <Block icon={<IconStack2 />} title={t('cart.editQuantity')}>
              {isPage ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-pages">{t('product.pages')}</Label>
                    {pagesFromFiles ? (
                      <p className="flex h-12 items-center rounded-full border bg-muted/50 px-4 text-sm">
                        <span className="font-bold text-brand-navy tabular-nums">{formatNumber(pagesFromFiles)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{t('product.pagesFromFiles')}</span>
                      </p>
                    ) : (
                      <QuantityStepper id="edit-pages" value={pages} onChange={setPages} min={1} step={10} />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-copies">{t('product.copies')}</Label>
                    <QuantityStepper id="edit-copies" value={copies} onChange={setCopies} min={1} />
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <QuantityStepper id="edit-qty" value={quantity} onChange={setQuantity} min={1} step={product.pricing.retail.minQty >= 50 ? 10 : 1} />
                  {/* Price breaks: tap one to jump to it; the band the quantity is in is lit. */}
                  <QuantityPrices book={product.pricing.retail} unit={product.unit} units={quote?.units ?? quantity} onPick={setQuantity} />
                </div>
              )}
            </Block>

            {takesFiles && (
              <Block icon={<IconFiles />} title={t('product.uploadHeading')} hint={l(product.uploadHint) || undefined}>
                <FileUploader productId={product._id} accepted={product.acceptedFileTypes} files={files} onChange={setFiles} deferDelete />
                {missingFile && <p className="text-xs font-medium text-destructive">{t('cart.needFile')}</p>}
              </Block>
            )}

            <Block icon={<IconMessage />} title={t('product.notes')}>
              <Textarea value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} placeholder={t('product.notesPlaceholder')} className="min-h-20" />
            </Block>

            <div className="flex items-end justify-between gap-3 rounded-2xl bg-brand-navy p-4 text-white" aria-live="polite">
              <div>
                <p className="text-sm text-white/70">{t('product.subtotal')}</p>
                <p className="flex items-center gap-2 text-2xl font-bold tabular-nums">
                  {quote?.valid ? formatINR(quote.subtotal) : '—'}
                  {(isFetching || stale) && <Spinner className="size-4 text-current" />}
                </p>
              </div>
              {quote?.valid && (
                <p className="pb-1 text-sm text-white/75 tabular-nums">
                  {formatINR(quote.unitPrice)} × {formatNumber(quote.units)}
                </p>
              )}
            </div>
            {error && (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <IconAlertCircle className="mt-0.5 size-4 shrink-0" />
                {t(`product.errors.${error.code}`, { ...error.params, unitLabel: t(`units.${item.unit}`, { count: Number(error.params?.min ?? 2) }) })}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="brand" onClick={() => void save()} disabled={!quote?.valid || stale || isFetching || missingFile}>
            {t('cart.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
