import { IconBell, IconCash, IconDiscount2, IconPackage } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { EmptyState, ErrorState, PageLoader } from '@/components/common/states';
import { Card } from '@/components/ui/card';
import { useMarkUpdatesSeen, useUpdates, type Update } from '@/features/updates/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDate, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';

const ICON = { order: IconPackage, refund: IconCash, offer: IconDiscount2 } as const;

function UpdateText({ u }: { u: Update }) {
  const { t } = useTranslation();
  if (u.kind === 'offer') {
    return (
      <>
        {u.title && <p className="text-sm font-medium">{u.title}</p>}
        <p className="text-sm whitespace-pre-line">{u.text}</p>
      </>
    );
  }
  const title =
    u.kind === 'order'
      ? t('updates.orderStatus', { number: u.orderNumber, status: t(`status.order.${u.status}`) })
      : t(u.done ? 'updates.refundDone' : 'updates.refundStarted', { amount: formatINR(u.amount), number: u.orderNumber });
  return <p className="text-sm">{title}</p>;
}

export default function UpdatesPage() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('updates.title'));
  const { data, isLoading, error, refetch } = useUpdates();
  const markSeen = useMarkUpdatesSeen();
  // Remember what was unread when the page opened, so the highlight stays after marking them seen.
  const [seenAt, setSeenAt] = useState<string | null | undefined>(undefined);
  const marked = useRef(false);

  useEffect(() => {
    if (!data || marked.current) return;
    marked.current = true;
    setSeenAt(data.seenAt);
    if (data.unread > 0) markSeen.mutate();
  }, [data, markSeen]);

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const items = data?.items ?? [];
  const isNew = (u: Update) => seenAt !== undefined && (!seenAt || new Date(u.at) > new Date(seenAt));

  return (
    <div className="container-page py-10">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('updates.title')}</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">{t('updates.subtitle')}</p>

      {items.length === 0 ? (
        <EmptyState icon={<IconBell />} title={t('updates.empty')} description={t('updates.emptyDesc')} />
      ) : (
        <Card className="gap-0 divide-y py-0">
          {items.map((u) => {
            const Icon = ICON[u.kind];
            const body = (
              <div className={cn('flex items-start gap-3 px-4 py-3.5 sm:px-5', isNew(u) && 'bg-primary/5')}>
                <span
                  className={cn(
                    'mt-0.5 grid size-9 shrink-0 place-items-center rounded-full [&_svg]:size-[18px]',
                    u.kind === 'offer' ? 'bg-brand-magenta/10 text-brand-magenta' : 'bg-primary/10 text-primary',
                  )}
                >
                  <Icon />
                </span>
                <div className="min-w-0 flex-1">
                  <UpdateText u={u} />
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {u.kind === 'offer' ? `${t('updates.offer')} · ` : ''}
                    {formatDate(u.at, i18n.language, true)}
                  </p>
                </div>
                {isNew(u) && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label={t('updates.new')} />}
              </div>
            );
            return u.kind === 'offer' ? (
              <div key={u.id}>{body}</div>
            ) : (
              <Link key={u.id} to={`/account/orders/${u.orderId}`} className="block transition-colors hover:bg-accent/50">
                {body}
              </Link>
            );
          })}
        </Card>
      )}
    </div>
  );
}
