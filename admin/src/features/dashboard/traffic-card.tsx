import { IconDeviceDesktop, IconDeviceMobile, IconDeviceTablet, IconWorld } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { ErrorState, Spinner } from '@/components/common/states';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api-client';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Traffic {
  series: { date: string; views: number; visitors: number }[];
  totals: { views: number; visitors: number };
  today: { date: string; views: number; visitors: number };
  sources: { direct: number; search: number; social: number; other: number };
  devices: { mobile: number; tablet: number; desktop: number };
  topPages: { path: string; views: number }[];
}

const useTraffic = () =>
  useQuery({
    queryKey: ['admin-traffic', 30],
    queryFn: async () => (await api.get<Traffic>('/admin/analytics/traffic', { params: { days: 30 } })).data,
    refetchInterval: 5 * 60_000,
  });

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** Friendly names for the website's addresses. */
const PAGE_NAMES: Record<string, string> = {
  '/': 'Home',
  '/products': 'Products',
  '/business-printing': 'Business Works',
  '/wedding-cards': 'Wedding & Invitations',
  '/institutions': 'School & College',
  '/cart': 'Cart',
  '/checkout': 'Checkout',
  '/contact': 'Contact',
  '/track': 'Track order',
};
const pageName = (path: string) =>
  PAGE_NAMES[path] ?? (path.startsWith('/products/') ? `Product: ${path.slice(10).replace(/-/g, ' ')}` : path);

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">{formatNumber(value)}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Visitors per day: one series, one hue, thin bars with 2px gaps and a hover tooltip. */
function VisitorsChart({ data }: { data: Traffic['series'] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.visitors), 1);
  const step = 10 ** Math.floor(Math.log10(max));
  const top = Math.max(Math.ceil(max / step) * step, 1);
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <figure className="space-y-2">
      <div className="relative flex h-40 gap-3">
        <div className="flex w-8 flex-col justify-between pb-6 text-right text-[11px] text-muted-foreground tabular-nums">
          <span>{formatNumber(top)}</span>
          <span>{formatNumber(top / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-px w-full bg-border/70" />
            ))}
          </div>
          <div className="absolute inset-x-0 top-0 bottom-6 flex items-end gap-[2px]" onMouseLeave={() => setActive(null)}>
            {data.map((d, i) => (
              <button
                key={d.date}
                type="button"
                className="relative flex h-full flex-1 items-end focus:outline-none"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${dayLabel(d.date)}: ${d.visitors} visitors, ${d.views} page views`}
              >
                <span
                  className={cn('mx-auto block w-full max-w-5 rounded-t-[4px] bg-primary transition-opacity', active !== null && active !== i && 'opacity-40')}
                  style={{ height: `${(d.visitors / top) * 100}%`, minHeight: d.visitors > 0 ? 2 : 0 }}
                />
                {active === i && (
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-lg border bg-popover px-2.5 py-1.5 text-left text-xs whitespace-nowrap shadow-lg">
                    <span className="block font-medium text-muted-foreground">{dayLabel(d.date)}</span>
                    <span className="block font-bold text-foreground tabular-nums">{formatNumber(d.visitors)} visitors</span>
                    <span className="block text-muted-foreground tabular-nums">{formatNumber(d.views)} page views</span>
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex h-5 gap-[2px] text-[10px] text-muted-foreground">
            {data.map((d, i) => (
              <span key={d.date} className="flex-1 text-center whitespace-nowrap">
                {i % labelEvery === 0 ? dayLabel(d.date) : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">Visitors per day, last 30 days</figcaption>
    </figure>
  );
}

/** A share of the whole, written out: label, bar and number (the bar is never the only cue). */
function ShareRow({ icon, label, value, total }: { icon: ReactNode; label: string; value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <li className="space-y-1">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground [&_svg]:size-4">
          {icon}
          {label}
        </span>
        <span className="font-medium tabular-nums">
          {formatNumber(value)} <span className="text-xs text-muted-foreground">· {pct}%</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

/**
 * Website visits, counted by the shop's own server: no cookies, no Google Analytics, nothing
 * personal kept. Bots and browsers that ask not to be tracked are left out.
 */
export function TrafficCard() {
  const { data, isLoading, error, refetch } = useTraffic();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Website visits</CardTitle>
        <CardDescription>Counted without cookies; bots and “do not track” browsers are left out.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid h-40 place-items-center">
            <Spinner />
          </div>
        ) : error || !data ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Visitors today" value={data.today.visitors} hint={`${formatNumber(data.today.views)} page views`} />
              <Stat label="Visitors, 7 days" value={data.series.slice(-7).reduce((n, d) => n + d.visitors, 0)} />
              <Stat label="Visitors, 30 days" value={data.totals.visitors} hint="a returning visitor counts once a day" />
              <Stat label="Page views, 30 days" value={data.totals.views} />
            </div>

            <VisitorsChart data={data.series} />

            <div className="grid gap-6 md:grid-cols-3">
              <section>
                <h3 className="mb-3 text-sm font-semibold">Where visitors come from</h3>
                <ul className="space-y-3">
                  {(() => {
                    const s = data.sources;
                    const total = s.direct + s.search + s.social + s.other;
                    return (
                      <>
                        <ShareRow icon={<IconWorld />} label="Google & other search" value={s.search} total={total} />
                        <ShareRow icon={<IconWorld />} label="WhatsApp, Instagram & social" value={s.social} total={total} />
                        <ShareRow icon={<IconWorld />} label="Typed or saved link" value={s.direct} total={total} />
                        <ShareRow icon={<IconWorld />} label="Other websites" value={s.other} total={total} />
                      </>
                    );
                  })()}
                </ul>
              </section>
              <section>
                <h3 className="mb-3 text-sm font-semibold">Device</h3>
                <ul className="space-y-3">
                  {(() => {
                    const d = data.devices;
                    const total = d.mobile + d.tablet + d.desktop;
                    return (
                      <>
                        <ShareRow icon={<IconDeviceMobile />} label="Phone" value={d.mobile} total={total} />
                        <ShareRow icon={<IconDeviceTablet />} label="Tablet" value={d.tablet} total={total} />
                        <ShareRow icon={<IconDeviceDesktop />} label="Computer" value={d.desktop} total={total} />
                      </>
                    );
                  })()}
                </ul>
              </section>
              <section>
                <h3 className="mb-3 text-sm font-semibold">Most viewed pages</h3>
                {data.topPages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No visits yet.</p>
                ) : (
                  <ol className="space-y-2 text-sm">
                    {data.topPages.map((p) => (
                      <li key={p.path} className="flex items-center justify-between gap-3">
                        <span className="truncate capitalize">{pageName(p.path)}</span>
                        <span className="shrink-0 font-medium tabular-nums">{formatNumber(p.views)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
