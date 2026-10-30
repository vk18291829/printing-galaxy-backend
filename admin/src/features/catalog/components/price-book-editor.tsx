import { IconPlus, IconTrash } from '@tabler/icons-react';
import { Controller, useFieldArray, type Control, type UseFormRegister, useWatch } from 'react-hook-form';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { ProductFormValues } from './product-form-types';

export function PriceBookEditor({
  audience,
  control,
  register,
  title,
  description,
}: {
  audience: 'retail' | 'institution';
  control: Control<ProductFormValues>;
  register: UseFormRegister<ProductFormValues>;
  title: string;
  description: string;
}) {
  const tiers = useFieldArray({ control, name: `pricing.${audience}.tiers` });
  const enabled = useWatch({ control, name: `pricing.${audience}.enabled` });

  return (
    <div className="space-y-4 rounded-xl shadow-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Controller
          control={control}
          name={`pricing.${audience}.enabled`}
          render={({ field }) => <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={`${title} enabled`} />}
        />
      </div>
      {enabled && (
        <>
          <div className="w-40 space-y-1.5">
            <Label className="text-xs">Minimum order (units)</Label>
            <Input type="number" min={1} {...register(`pricing.${audience}.minQty`, { valueAsNumber: true })} />
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-semibold text-muted-foreground">
              <span>From quantity</span>
              <span>Unit price (₹)</span>
              <span className="w-8" />
            </div>
            {tiers.fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input type="number" min={1} {...register(`pricing.${audience}.tiers.${i}.minQty`, { valueAsNumber: true })} />
                <Input type="number" min={0} step="0.01" {...register(`pricing.${audience}.tiers.${i}.unitPrice`, { valueAsNumber: true })} />
                <Button type="button" variant="danger" size="icon" className="size-10" onClick={() =>
                void confirmAction({ tone: 'danger', title: 'Remove this price break?', description: 'It is removed when you save the product.', confirmLabel: 'Remove' }).then((ok) => ok && tiers.remove(i))
              } aria-label="Remove tier">
                  <IconTrash className="size-4" />
                </Button>
              </div>
            ))}
            {tiers.fields.length === 0 && (
              <p className="text-xs text-muted-foreground">No tiers: the product is priced on request (quote workflow).</p>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const last = tiers.fields.at(-1);
                tiers.append({ minQty: last ? last.minQty * 2 : 1, unitPrice: last?.unitPrice ?? 0 });
              }}
            >
              <IconPlus /> Add tier
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
