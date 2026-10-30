import { IconCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { formatINR } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { ProductOption } from '@/types/api';

/** One choice per option, as tiles; shows the price effect of each choice. */
export function OptionPicker({
  options,
  value,
  onChange,
}: {
  options: ProductOption[];
  value: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const l = useLocalized();
  const { t } = useTranslation();

  return (
    <div className="space-y-5">
      {options.map((option) => (
        <fieldset key={option.key} className="space-y-2.5">
          <legend className="mb-2.5 text-sm font-semibold">{l(option.label)}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={l(option.label)}>
            {option.values.map((v) => {
              const selected = value[option.key] === v.value;
              const effect =
                v.unitDelta !== 0
                  ? `${v.unitDelta > 0 ? '+' : '−'}${formatINR(Math.abs(v.unitDelta))}`
                  : v.fixedFee > 0
                    ? `+${formatINR(v.fixedFee)}/${t('units.copy_one')}`
                    : null;
              return (
                <button
                  key={v.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onChange(option.key, v.value)}
                  className={cn(
                    'flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    selected ? 'border-brand-navy bg-secondary ring-2 ring-brand-navy/10' : 'bg-card hover:border-primary/40',
                  )}
                >
                  {/* A tick for the chosen value, an empty circle for the others. */}
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-full border-2 transition-colors',
                      selected ? 'border-brand-navy bg-brand-navy text-white' : 'border-muted-foreground/35',
                    )}
                  >
                    {selected && <IconCheck className="size-3" stroke={3.5} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm leading-snug font-semibold', selected ? 'text-brand-navy' : 'text-foreground')}>{l(v.label)}</span>
                    {effect && (
                      <span
                        className={cn(
                          'mt-0.5 inline-block rounded-full px-1.5 text-[11px] font-semibold tabular-nums',
                          v.unitDelta < 0 ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {effect}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
