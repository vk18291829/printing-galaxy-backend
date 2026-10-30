import { IconMinus, IconPlus } from '@tabler/icons-react';
import { cn } from '@/lib/utils';

/** Number input with round − / + buttons in one pill, sized for touch. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  step = 1,
  id,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  id?: string;
  className?: string;
}) {
  const round =
    'grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary transition-colors hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-40';
  return (
    <div
      className={cn(
        'flex h-12 w-full max-w-[220px] items-center gap-1 rounded-full border bg-card p-1.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15',
        className,
      )}
    >
      <button type="button" className={round} onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min} aria-label="Decrease">
        <IconMinus className="size-4" stroke={2.5} />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-lg font-bold text-brand-navy tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button" className={round} onClick={() => onChange(value + step)} aria-label="Increase">
        <IconPlus className="size-4" stroke={2.5} />
      </button>
    </div>
  );
}
