import { IconBell, IconCash, IconChevronRight, IconCircleCheck, IconDiscount2, IconEyeCheck, IconPackage } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PageBanner } from '@/components/common/page-banner';
import { EmptyState, ErrorState, PageLoader } from '@/components/common/states';
import { useMarkUpdatesSeen, useUpdates, type Update } from '@/features/updates/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDate, formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'order' | 'refund' | 'offer';

/** Steps where the customer has to do something (accept a price, approve a proof). */
const NEEDS_CUSTOMER = new Set(['quote_sent', 'proof_sent', 'awaiting_payment']);
/** Steps that are good news: ready, delivered, collected. */
const GOOD_NEWS = new Set(['ready', 'delivered', 'picked_up']);

/** Icon and colour by what the update is about (logo colours; green only for good news). */
function look(u: Update) {
  if (u.kind === 'offer') return { Icon: IconDiscount2, tone: 'bg-brand-magenta/12 text-brand-magenta' };
  if (u.kind === 'refund') return { Icon: IconCash, tone: 'bg-success/12 text-success' };
  if (NEEDS_CUSTOMER.has(u.status)) return { Icon: IconEyeCheck, tone: 'bg-brand-amber/20 text-brand-navy' };
  if (GOOD_NEWS.has(u.status)) return { Icon: IconCircleCheck, tone: 'bg-success/12 text-success' };
  return { Icon: IconPackage, tone: 'bg-brand-navy text-white' };
}

function UpdateText({ u }: { u: Update }) {
  const { t } = useTranslation();
  if (u.kind === 'offer') {
    return (
      <>
        {u.title && <p className="font-semibold text-foreground">{u.title}</p>}
        <p className="text-sm whitespace-pre-line text-muted-foreground">{u.text}</p>
      </>
    );
  }
  if (u.kind === 'refund') {
    return (
      <p className="font-medium text-foreground">
        {t(u.done ? 'updates.refundDone' : 'updates.refundStarted', { amount: formatINR(u.amount), number: u.orderNumber })}
      </p>
    );
  }
  return (
    <p className="font-medium text-foreground">
      <span className="font-mono text-sm">{u.orderNumber}</span> · {t(`status.order.${u.status}`)}
    </p>
  );
}

/** "Today", "Yesterday" or the date, for the day headings. */
function dayLabel(iso: string, lang: string, t: (k: string) => string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return t('updates.today');
  if (d.toDateString() === yesterday.toDateString()) return t('updates.yesterday');
  return formatDate(iso, lang);
}

export default function UpdatesPage() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('updates.title'));
  const { data, isLoading, error, refetch } = useUpdates();
  const markSeen = useMarkUpdatesSeen();
  const [filter, setFilter] = useState<Filter>('all');
  // Remember what was unread when the page opened, so the highlight stays after marking them seen.
  const [seenAt, setSeenAt] = useState<string | null | undefined>(undefined);
  const marked = useRef(false);

  useEffect(() => {
    if (!data || marked.current) return;
    marked.current = true;
    setSeenAt(data.seenAt);
    if (data.unread > 0) markSeen.mutate();
  }, [data, markSeen]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const isNew = (u: Update) => seenAt !== undefined && (!seenAt || new Date(u.at) > new Date(seenAt));
  const counts = useMemo(
    () => ({ all: items.length, order: items.filter((u) => u.kind === 'order').length, refund: items.filter((u) => u.kind === 'refund').length, offer: items.filter((u) => u.kind === 'offer').length }),
    [items],
  );
  const groups = useMemo(() => {
    const shown = filter === 'all' ? items : items.filter((u) => u.kind === filter);
    const map = new Map<string, Update[]>();
    for (const u of shown) {
      const key = new Date(u.at).toDateString();
      map.set(key, [...(map.get(key) ?? []), u]);
    }
    return [...map.values()];
  }, [items, filter]);

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const newCount = seenAt === undefined ? 0 : items.filter(isNew).length;
  const filters: Filter[] = ['all', 'order', 'refund', 'offer'];

  return (
    <div className="container-page py-8 sm:py-10">
      <PageBanner
        className="mb-6"
        icon={<IconBell />}
        title={t('updates.title')}
        description={t('updates.subtitle')}
        actions={
          newCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-amber px-3 py-1 text-sm font-semibold text-brand-navy">
              <IconBell className="size-4" /> {t('updates.unread', { count: newCount })}
            </span>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState icon={<IconBell />} title={t('updates.empty')} description={t('updates.emptyDesc')} />
      ) : (
        <div className="grid gap-6 *:min-w-0 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
          {/* Filters: chips on phones, a sticky column beside the list on wide screens. */}
          <div
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:sticky lg:top-28 lg:flex-col lg:self-start lg:overflow-visible lg:pb-0"
            role="tablist"
            aria-label={t('updates.title')}
          >
            {filters
              .filter((f) => f === 'all' || counts[f] > 0)
              .map((f) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  aria-selected={filter === f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    'flex h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors lg:h-11 lg:justify-between lg:rounded-xl',
                    filter === f ? 'border-brand-navy bg-brand-navy text-white' : 'bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(`updates.filter.${f}`)}
                  <span className={cn('rounded-full px-1.5 text-xs tabular-nums', filter === f ? 'bg-white/20' : 'bg-muted')}>{counts[f]}</span>
                </button>
              ))}
          </div>

          <div className="space-y-8">
            {groups.map((group) => (
              <section key={group[0]!.at}>
                <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">{dayLabel(group[0]!.at, i18n.language, t)}</h2>
                <ol className="grid gap-2.5 2xl:grid-cols-2">
                  {group.map((u) => {
                    const { Icon, tone } = look(u);
                    const action = u.kind === 'order' && NEEDS_CUSTOMER.has(u.status);
                    const fresh = isNew(u);
                    const body = (
                      <div
                        className={cn(
                          'flex items-start gap-3.5 rounded-2xl border bg-card p-4 transition-colors',
                          fresh && 'border-brand-amber/50 bg-brand-amber/5',
                          u.kind !== 'offer' && 'group-hover:border-primary/30',
                        )}
                      >
                        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl [&_svg]:size-5', tone)}>
                          <Icon />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <UpdateText u={u} />
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{new Date(u.at).toLocaleTimeString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
                            {u.kind === 'offer' && <span className="rounded-full bg-brand-magenta/10 px-2 py-0.5 font-semibold text-brand-magenta">{t('updates.offer')}</span>}
                            {action && <span className="rounded-full bg-brand-amber px-2 py-0.5 font-semibold text-brand-navy">{t('updates.actionNeeded')}</span>}
                            {fresh && (
                              <span className="inline-flex items-center gap-1 font-semibold text-brand-navy">
                                <span className="size-1.5 rounded-full bg-brand-amber" /> {t('updates.new')}
                              </span>
                            )}
                          </div>
                        </div>
                        {u.kind !== 'offer' && <IconChevronRight className="mt-2.5 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />}
                      </div>
                    );
                    return (
                      <li key={u.id}>
                        {u.kind === 'offer' ? (
                          body
                        ) : (
                          <Link to={`/account/orders/${u.orderId}`} className="group block rounded-2xl focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
                            {body}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
