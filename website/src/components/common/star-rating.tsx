import { IconStarFilled } from '@tabler/icons-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Read-only stars with partial fill for averages like 4.3. */
export function StarRating({ value, className, size = 'size-4' }: { value: number; className?: string; size?: string }) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} role="img" aria-label={`${value.toFixed(1)} / 5`}>
      <span className="flex text-muted-foreground/30">
        {Array.from({ length: 5 }).map((_, i) => (
          <IconStarFilled key={i} className={size} />
        ))}
      </span>
      <span className="absolute inset-y-0 left-0 flex overflow-hidden text-amber-500" style={{ width: `${(Math.max(0, Math.min(5, value)) / 5) * 100}%` }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <IconStarFilled key={i} className={cn(size, 'shrink-0')} />
        ))}
      </span>
    </span>
  );
}

/** Compact "★ 4.6 (23)" chip used on product cards. */
export function RatingChip({ average, count, className }: { average: number; count: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', className)}>
      <span className="inline-flex items-center gap-0.5 rounded bg-success px-1.5 py-0.5 font-semibold text-white tabular-nums">
        {average.toFixed(1)} <IconStarFilled className="size-3" />
      </span>
      <span className="text-muted-foreground tabular-nums">({count})</span>
    </span>
  );
}

/** 1–5 star picker with hover preview and keyboard support (radio group). */
export function StarInput({ value, onChange, labels }: { value: number; onChange: (v: number) => void; labels: string[] }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={labels[n - 1]}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            className="rounded-md p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <IconStarFilled className={cn('size-8 transition-colors', n <= shown ? 'text-amber-500' : 'text-muted-foreground/25')} />
          </button>
        ))}
      </div>
      {shown > 0 && <span className="text-sm font-medium text-muted-foreground">{labels[shown - 1]}</span>}
    </div>
  );
}
