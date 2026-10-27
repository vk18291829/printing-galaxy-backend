import { IconPlus, IconTrash } from '@tabler/icons-react';
import { Controller, useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { ProductFormValues } from './product-form-types';

function OptionValues({ control, register, index }: { control: Control<ProductFormValues>; register: UseFormRegister<ProductFormValues>; index: number }) {
  const values = useFieldArray({ control, name: `options.${index}.values` });
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1fr_1.2fr_1.2fr_0.8fr_0.8fr_0.7fr_auto_auto] gap-2 text-[11px] font-semibold text-muted-foreground uppercase md:grid">
        <span>Value</span>
        <span>Label (EN)</span>
        <span>Label (HI)</span>
        <span>+₹ / unit</span>
        <span>+₹ / copy</span>
        <span>Min copies</span>
        <span>Default</span>
        <span className="w-8" />
      </div>
      {values.fields.map((f, vi) => (
        <div key={f.id} className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-2 md:grid-cols-[1fr_1.2fr_1.2fr_0.8fr_0.8fr_0.7fr_auto_auto] md:bg-transparent md:p-0">
          <Input placeholder="value" className="h-8" {...register(`options.${index}.values.${vi}.value`)} />
          <Input placeholder="Label" className="h-8" {...register(`options.${index}.values.${vi}.label.en`)} />
          <Input placeholder="हिंदी" className="h-8" {...register(`options.${index}.values.${vi}.label.hi`)} />
          <Input type="number" step="0.01" className="h-8" {...register(`options.${index}.values.${vi}.unitDelta`, { valueAsNumber: true })} />
          <Input type="number" step="0.01" min={0} className="h-8" {...register(`options.${index}.values.${vi}.fixedFee`, { valueAsNumber: true })} />
          <Input
            type="number"
            min={1}
            className="h-8"
            placeholder="—"
            {...register(`options.${index}.values.${vi}.minCopies`, { setValueAs: (v) => (v === '' || v === null ? null : Number(v)) })}
          />
          <Controller
            control={control}
            name={`options.${index}.values.${vi}.isDefault`}
            render={({ field }) => (
              <label className="flex items-center gap-2 text-xs md:justify-center">
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                <span className="md:sr-only">Default</span>
              </label>
            )}
          />
          <Button type="button" variant="danger" size="icon" className="size-8" onClick={() => values.remove(vi)} aria-label="Remove choice">
            <IconTrash className="size-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => values.append({ value: '', label: { en: '', hi: '' }, unitDelta: 0, fixedFee: 0, minCopies: null, isDefault: false })}
      >
        <IconPlus /> Add choice
      </Button>
    </div>
  );
}

export function OptionsEditor({ control, register }: { control: Control<ProductFormValues>; register: UseFormRegister<ProductFormValues> }) {
  const options = useFieldArray({ control, name: 'options' });
  return (
    <div className="space-y-4">
      {options.fields.map((f, i) => (
        <div key={f.id} className="space-y-3 rounded-xl shadow-card p-4">
          <div className="grid gap-2 sm:grid-cols-[0.8fr_1fr_1fr_auto]">
            <Input placeholder="key (e.g. paperSize)" {...register(`options.${i}.key`)} />
            <Input placeholder="Option name (EN)" {...register(`options.${i}.label.en`)} />
            <Input placeholder="विकल्प का नाम (HI)" {...register(`options.${i}.label.hi`)} />
            <Button type="button" variant="danger" size="icon" onClick={() => options.remove(i)} aria-label="Remove option">
              <IconTrash className="size-4" />
            </Button>
          </div>
          <OptionValues control={control} register={register} index={i} />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          options.append({
            key: '',
            label: { en: '', hi: '' },
            required: true,
            values: [{ value: '', label: { en: '', hi: '' }, unitDelta: 0, fixedFee: 0, minCopies: null, isDefault: true }],
          })
        }
      >
        <IconPlus /> Add option
      </Button>
      <p className="text-xs text-muted-foreground">
        “+₹ / unit” is added to every unit (e.g. colour +₹4/page; negative for cheaper choices). “+₹ / copy” is a fixed fee per copy (e.g.
        spiral binding). “Min copies” enforces a rule like spiral binding ≥ 3 copies.
      </p>
    </div>
  );
}
