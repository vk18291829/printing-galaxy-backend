import { useTranslation } from 'react-i18next';
import { formatINR } from '@/lib/format';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { ProductOption } from '@/types/api';

/** Chip-style single choice per option; shows the price effect of each choice. */
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
          <div className="flex flex-wrap gap-2" role="radiogroup">
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
                    'flex items-center gap-2 rounded-lg shadow-card px-3.5 py-2.5 text-left text-sm font-medium transition-all',
                    selected
                      ? 'border-primary bg-primary/8 text-foreground ring-2 ring-primary/20'
                      : 'bg-background text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded-full border-2',
                      selected ? 'border-primary' : 'border-muted-foreground/40',
                    )}
                  >
                    {selected && <span className="size-1.5 rounded-full bg-primary" />}
                  </span>
                  <span>{l(v.label)}</span>
                  {effect && (
                    <span className={cn('text-xs', v.unitDelta < 0 ? 'text-success' : 'text-muted-foreground')}>
                      {effect}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
    </div>
  );
}
