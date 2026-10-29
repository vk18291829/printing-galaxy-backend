import { formatINR } from '@/lib/format';
import { en } from '@/lib/l10n';
import { cn } from '@/lib/utils';
import type { ProductOption } from '@/types/api';

/** Same chips the customer sees on the website: one choice per option, with its price effect. */
export function OptionPicker({
  options,
  value,
  onChange,
}: {
  options: ProductOption[];
  value: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="space-y-4">
      {options.map((option) => (
        <fieldset key={option.key}>
          <legend className="mb-2 text-xs font-semibold">{en(option.label)}</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={en(option.label)}>
            {option.values.map((v) => {
              const selected = value[option.key] === v.value;
              const effect =
                v.unitDelta !== 0
                  ? `${v.unitDelta > 0 ? '+' : '−'}${formatINR(Math.abs(v.unitDelta))}`
                  : v.fixedFee > 0
                    ? `+${formatINR(v.fixedFee)}/copy`
                    : null;
              return (
                <button
                  key={v.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange(option.key, v.value)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors',
                    selected ? 'border-primary bg-primary/8 text-foreground ring-2 ring-primary/20' : 'bg-card text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className={cn('grid size-4 shrink-0 place-items-center rounded-full border-2', selected ? 'border-brand-amber' : 'border-muted-foreground/40')}>
                    {selected && <span className="size-1.5 rounded-full bg-brand-amber" />}
                  </span>
                  <span>{en(v.label)}</span>
                  {effect && <span className={cn('text-xs', v.unitDelta < 0 ? 'text-success' : 'text-muted-foreground')}>{effect}</span>}
                  {v.minCopies && v.minCopies > 1 ? <span className="text-xs text-muted-foreground">· min {v.minCopies} copies</span> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
