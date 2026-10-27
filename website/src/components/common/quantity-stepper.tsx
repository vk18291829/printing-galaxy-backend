import { IconMinus, IconPlus } from '@tabler/icons-react';

/** Number input with − / + buttons, sized for touch. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  step = 1,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  id?: string;
}) {
  return (
    <div className="flex h-11 w-full max-w-[220px] items-center rounded-xl shadow-card bg-background">
      <button
        type="button"
        className="grid h-full w-11 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-40"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label="Decrease"
      >
        <IconMinus className="size-4" />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="h-full min-w-0 flex-1 bg-transparent text-center text-base font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        className="grid h-full w-11 place-items-center text-muted-foreground hover:text-foreground"
        onClick={() => onChange(value + step)}
        aria-label="Increase"
      >
        <IconPlus className="size-4" />
      </button>
    </div>
  );
}
