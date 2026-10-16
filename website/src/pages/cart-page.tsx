import { IconArrowRight, IconInfoCircle, IconShoppingBag } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState, Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useCartStore } from '@/features/cart/cart-store';
import { CartLine } from '@/features/cart/components/cart-line';
import { useCartQuotes } from '@/features/cart/use-cart-quotes';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatINR } from '@/lib/format';

export default function CartPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('cart.title'));
  const items = useCartStore((s) => s.items);
  const remove = useCartStore((s) => s.remove);
  const { lines, subtotal, invalid, hasQuoteItems, loading } = useCartQuotes(items);

  if (items.length === 0) {
    return (
      <div className="container-page py-16">
        <EmptyState
          icon={<IconShoppingBag />}
          title={t('cart.empty')}
          description={t('cart.emptyDesc')}
          action={
            <Button asChild>
              <Link to="/products">{t('cart.browse')}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page py-10">
      <h1 className="mb-8 text-2xl font-semibold tracking-tight sm:text-3xl">{t('cart.title')}</h1>
      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <Card className="py-2">
          <CardContent className="divide-y">
            {lines.map(({ item, quote, amount }) => (
              <CartLine key={item.id} item={item} quote={quote} amount={amount} onRemove={() => remove(item.id)} />
            ))}
          </CardContent>
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-32 lg:self-start">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('cart.summary')}</CardTitle>
              {loading && <Spinner className="size-4" />}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end justify-between">
                <span className="text-muted-foreground">{t('cart.subtotal')}</span>
                <span className="text-2xl font-bold tabular-nums">{formatINR(subtotal)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('cart.estimatedNote')}</p>
              {hasQuoteItems && (
                <Alert variant="info">
                  <IconInfoCircle />
                  <AlertDescription className="text-foreground">{t('cart.quoteItems')}</AlertDescription>
                </Alert>
              )}
              {invalid && <p className="text-sm text-destructive">{t('cart.invalid')}</p>}
              <Separator />
              <Button size="lg" variant="brand" className="w-full" disabled={invalid} asChild={!invalid}>
                {invalid ? (
                  <span>{t('cart.checkout')}</span>
                ) : (
                  <Link to="/checkout">
                    {t('cart.checkout')} <IconArrowRight />
                  </Link>
                )}
              </Button>
              <Button variant="ghost" className="w-full" asChild>
                <Link to="/products">{t('cart.continueShopping')}</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
