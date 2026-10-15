import { useState } from 'react';
import { formatINR } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Point {
  date: string;
  revenue: number;
  orders: number;
}

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/**
 * Single-series daily revenue bars: one hue, thin rounded data-ends on the baseline,
 * 2px gaps, per-bar hover tooltip with a hit target taller than the bar.
 */
export function RevenueChart({
  data,
  formatLabel = dayLabel,
  caption = 'Revenue per day, last 14 days',
}: {
  data: Point[];
  formatLabel?: (key: string) => string;
  caption?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  // Roughly six axis labels whatever the range.
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));
  const max = Math.max(...data.map((d) => d.revenue), 1);
  // Round the axis top to a friendly number.
  const step = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / step) * step;
  const ticks = [top, top / 2, 0];

  return (
    <figure className="space-y-2">
      <div className="relative flex h-56 gap-3">
        <div className="flex w-14 flex-col justify-between pb-6 text-right text-[11px] text-muted-foreground tabular-nums">
          {ticks.map((t) => (
            <span key={t}>{t >= 1000 ? `₹${(t / 1000).toFixed(t % 1000 ? 1 : 0)}k` : `₹${t}`}</span>
          ))}
        </div>
        <div className="relative flex-1">
          {/* Recessive gridlines */}
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
            {ticks.map((t) => (
              <span key={t} className="h-px w-full bg-border/70" />
            ))}
          </div>
          <div className="absolute inset-x-0 top-0 bottom-6 flex items-end gap-[2px]" onMouseLeave={() => setActive(null)}>
            {data.map((d, i) => (
              <button
                key={d.date}
                type="button"
                className="group relative flex h-full flex-1 items-end focus:outline-none"
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                aria-label={`${formatLabel(d.date)}: ${formatINR(d.revenue)}, ${d.orders} orders`}
              >
                <span
                  className={cn(
                    'mx-auto block w-full max-w-7 rounded-t-[4px] bg-primary transition-opacity',
                    active !== null && active !== i && 'opacity-40',
                  )}
                  style={{ height: `${(d.revenue / top) * 100}%`, minHeight: d.revenue > 0 ? 2 : 0 }}
                />
                {active === i && (
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-lg border bg-popover px-2.5 py-1.5 text-left text-xs whitespace-nowrap shadow-lg">
                    <span className="block font-medium text-muted-foreground">{formatLabel(d.date)}</span>
                    <span className="block font-bold text-foreground tabular-nums">{formatINR(d.revenue)}</span>
                    <span className="block text-muted-foreground">
                      {d.orders} order{d.orders === 1 ? '' : 's'}
                    </span>
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex h-5 gap-[2px] text-[10px] text-muted-foreground">
            {data.map((d, i) => (
              <span key={d.date} className="flex-1 text-center">
                {i % labelEvery === 0 || i === data.length - 1 ? formatLabel(d.date) : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th>{d.date}</th>
              <td>{d.revenue}</td>
              <td>{d.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
