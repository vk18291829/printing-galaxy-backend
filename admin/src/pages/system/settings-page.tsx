import { IconDeviceFloppy } from '@tabler/icons-react';
import { useEffect, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { confirmAction } from '@/components/common/confirm-dialog';
import { ErrorState, PageHeader, PageLoader, Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSaveSettings, useSettings } from '@/features/management/api';
import type { Settings } from '@/types/admin';

type FormValues = Omit<Settings, '_id'>;

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch checked={value} onCheckedChange={onChange} />
    </label>
  );
}

export default function SettingsPage() {
  const { data, isLoading, error, refetch } = useSettings();
  const save = useSaveSettings();
  const { register, control, handleSubmit, reset } = useForm<FormValues>();

  useEffect(() => {
    if (data) {
      const { _id, ...rest } = data;
      void _id;
      reset(rest);
    }
  }, [data, reset]);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const onSubmit = handleSubmit((values) =>
    confirmAction({
      title: 'Save shop settings?',
      description: 'Shop details, tax, delivery and payment options change on the website and on new invoices straight away. Existing orders keep their totals.',
      confirmLabel: 'Save settings',
      action: () =>
        save.mutateAsync({
          shop: values.shop,
          social: values.social,
          tax: values.tax,
          delivery: values.delivery,
          payments: values.payments,
          sensitiveRetentionDays: values.sensitiveRetentionDays,
        }),
      successTitle: 'Settings saved',
    }),
  );

  return (
    <form onSubmit={onSubmit}>
      <PageHeader
        title="Settings"
        description="Shop details shown on the website, tax, delivery and payments."
        actions={
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Spinner className="size-4 text-current" /> : <IconDeviceFloppy />} Save settings
          </Button>
        }
      />
      <div className="grid items-start gap-6 *:min-w-0 xl:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Shop</CardTitle>
              <CardDescription>Shown in the website footer, contact page and messages.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Shop name">
                <Input {...register('shop.name')} />
              </Field>
              <Field label="Phone (10 digits)">
                <Input inputMode="numeric" {...register('shop.phone')} />
              </Field>
              <Field label="WhatsApp chat number (empty = phone)">
                <Input inputMode="numeric" {...register('shop.whatsapp')} />
              </Field>
              <Field label="Email (shop alerts go here)">
                <Input type="email" {...register('shop.email')} />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address">
                  <Input {...register('shop.address')} />
                </Field>
              </div>
              <Field label="Google Maps link">
                <Input {...register('shop.mapUrl')} />
              </Field>
              <Field label="Opening hours">
                <Input {...register('shop.hours')} />
              </Field>
              <Field label="GSTIN">
                <Input className="uppercase" maxLength={15} {...register('shop.gstin')} />
              </Field>
              <Field label="State (GST registration)" hint="Same state as the customer = CGST + SGST, otherwise IGST">
                <Input placeholder="Uttar Pradesh" {...register('shop.state')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Social media</CardTitle>
              <CardDescription>Shown as icons in the website footer and on the contact page. Leave empty to hide.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Instagram">
                <Input type="url" placeholder="https://instagram.com/printinggalaxy" {...register('social.instagram')} />
              </Field>
              <Field label="Facebook">
                <Input type="url" placeholder="https://facebook.com/printinggalaxy" {...register('social.facebook')} />
              </Field>
              <Field label="YouTube">
                <Input type="url" placeholder="https://youtube.com/@printinggalaxy" {...register('social.youtube')} />
              </Field>
              <Field label="X (Twitter)">
                <Input type="url" placeholder="https://x.com/printinggalaxy" {...register('social.x')} />
              </Field>
              <Field label="LinkedIn">
                <Input type="url" placeholder="https://linkedin.com/company/printinggalaxy" {...register('social.linkedin')} />
              </Field>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>GST</CardTitle>
              <CardDescription>Requirements doc: confirm whether the shop is GST registered.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Controller control={control} name="tax.enabled" render={({ field }) => <Toggle label="Charge / show GST" value={field.value} onChange={field.onChange} />} />
              <Controller
                control={control}
                name="tax.pricesIncludeTax"
                render={({ field }) => (
                  <Toggle label="Catalogue prices already include GST" hint="Off = GST is added on top at checkout" value={field.value} onChange={field.onChange} />
                )}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="GST rate (%)">
                  <Input type="number" min={0} max={28} {...register('tax.rate', { valueAsNumber: true })} />
                </Field>
                <Field label="HSN / SAC on invoices" hint="9989 = printing services">
                  <Input maxLength={10} {...register('tax.sacCode')} />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Delivery & payments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Controller control={control} name="delivery.enabled" render={({ field }) => <Toggle label="Offer home delivery" value={field.value} onChange={field.onChange} />} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Delivery fee (₹)">
                  <Input type="number" min={0} {...register('delivery.fee', { valueAsNumber: true })} />
                </Field>
                <Field label="Free delivery above (₹)">
                  <Input type="number" min={0} {...register('delivery.freeAbove', { valueAsNumber: true })} />
                </Field>
              </div>
              <Controller
                control={control}
                name="payments.onlineEnabled"
                render={({ field }) => (
                  <Toggle label="Online payment (Razorpay)" hint="Also needs Razorpay keys on the server" value={field.value} onChange={field.onChange} />
                )}
              />
              <Controller control={control} name="payments.counterEnabled" render={({ field }) => <Toggle label="Pay at counter / on delivery" value={field.value} onChange={field.onChange} />} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Unpaid online orders cancel after (minutes)" hint="Individuals paying online: printing starts only after payment.">
                  <Input type="number" min={5} max={1440} {...register('payments.onlineTimeoutMinutes', { valueAsNumber: true })} />
                </Field>
                <Field label="Days to pay a custom quote" hint="After you price a custom job for an online-paying customer.">
                  <Input type="number" min={1} max={30} {...register('payments.quotePaymentDays', { valueAsNumber: true })} />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Privacy</CardTitle>
            </CardHeader>
            <CardContent>
              <Field label="Delete identity documents after (days)" hint="Counted from when the order is delivered or picked up">
                <Input type="number" min={1} max={365} {...register('sensitiveRetentionDays', { valueAsNumber: true })} />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
