import { IconAlertCircle } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { QuantityStepper } from '@/components/common/quantity-stepper';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useProduct, useQuote, type QuoteInput } from '@/features/catalog/api';
import { OptionPicker } from '@/features/catalog/components/option-picker';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatINR, formatNumber } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { useCartStore, type CartItem } from '../cart-store';

/**
 * Change a cart item in place: its options and quantity, priced live. The uploaded files and the
 * instructions stay with the item (going back to the product page would start a new one).
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
  // Every time it opens, start from what is in the cart now.
  useEffect(() => {
    if (!open) return;
    setOptions(item.options);
    setQuantity(item.quantity ?? 1);
    setCopies(item.copies ?? 1);
    setPages(item.pageCount ?? 1);
  }, [open, item]);

  const isPage = item.unit === 'page';
  // Pages counted from the uploaded PDFs can't be changed here.
  const pagesFromFiles = isPage && item.files.length > 0 && item.files.every((f) => f.pageCount) ? item.files.reduce((n, f) => n + (f.pageCount ?? 0), 0) : null;
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

  const save = () => {
    update(item.id, {
      options,
      optionLabels: quote?.selectedOptions.map((o) => ({ label: o.label, value: o.valueLabel })) ?? item.optionLabels,
      ...(isPage ? { pageCount: pagesFromFiles ?? pages, copies } : { quantity }),
      estimate: quote?.subtotal ?? item.estimate,
    });
    toast.success(t('cart.updated', { name: l(item.name) }));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('cart.editTitle', { name: l(item.name) })}</DialogTitle>
          <DialogDescription>{t('cart.editDesc')}</DialogDescription>
        </DialogHeader>

        {isLoading || !product ? (
          <div className="grid h-40 place-items-center">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-5">
            {product.options.length > 0 && <OptionPicker options={product.options} value={options} onChange={(k, v) => setOptions((o) => ({ ...o, [k]: v }))} />}
            <div className="grid gap-4 sm:grid-cols-2">
              {isPage ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-pages">{t('product.pages')}</Label>
                    {pagesFromFiles ? (
                      <p className="flex h-11 items-center rounded-xl border bg-muted/50 px-3 text-sm">
                        <span className="font-semibold tabular-nums">{formatNumber(pagesFromFiles)}</span>
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
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="edit-qty">{t('product.quantityHeading')}</Label>
                  <QuantityStepper id="edit-qty" value={quantity} onChange={setQuantity} min={1} step={product.pricing.retail.minQty >= 50 ? 10 : 1} />
                </div>
              )}
            </div>

            <div className="flex items-end justify-between gap-3 rounded-xl bg-secondary/60 p-4" aria-live="polite">
              <div>
                <p className="text-sm text-muted-foreground">{t('product.subtotal')}</p>
                <p className="flex items-center gap-2 text-2xl font-bold tabular-nums">
                  {quote?.valid ? formatINR(quote.subtotal) : '—'}
                  {(isFetching || stale) && <Spinner className="size-4" />}
                </p>
              </div>
              {quote?.valid && (
                <p className="pb-1 text-sm text-muted-foreground tabular-nums">
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="brand" onClick={save} disabled={!quote?.valid || stale || isFetching}>
            {t('cart.saveChanges')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
