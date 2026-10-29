import {
  IconBuildingStore,
  IconDeviceFloppy,
  IconPencil,
  IconReceiptTax,
  IconSettings,
  IconShare,
  IconShieldLock,
  IconTruckDelivery,
  IconX,
} from '@tabler/icons-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { confirmAction } from '@/components/common/confirm-dialog';
import { ErrorState, PageHeader, PageLoader, SectionTitle, Spinner } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useSaveSettings, useSettings } from '@/features/management/api';
import { cn } from '@/lib/utils';
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

type SectionId = 'shop' | 'social' | 'tax' | 'delivery' | 'privacy';

/** The settings each section owns; saving a section sends only these, the rest as last saved. */
const SECTION_KEYS: Record<SectionId, (keyof FormValues)[]> = {
  shop: ['shop'],
  social: ['social'],
  tax: ['tax'],
  delivery: ['delivery', 'payments'],
  privacy: ['sensitiveRetentionDays'],
};

const SECTION_TITLE: Record<SectionId, string> = {
  shop: 'Shop details',
  social: 'Social media',
  tax: 'GST',
  delivery: 'Delivery & payments',
  privacy: 'Privacy',
};

/**
 * One full-width settings section. Its fields are read-only until Edit; while editing, Cancel and
 * Save sit at the bottom of the section and save just this section.
 */
function Section({
  icon,
  title,
  description,
  editing,
  locked,
  saving,
  onEdit,
  onCancel,
  onSave,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  editing: boolean;
  /** Another section is being edited. */
  locked: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  children: ReactNode;
}) {
  return (
    <Card className={cn(editing && 'outline-2 outline-offset-0 outline-brand-amber')}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <SectionTitle icon={icon} title={title} description={description} />
        {editing ? (
          <Badge variant="warning" className="shrink-0">
            Editing
          </Badge>
        ) : (
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={onEdit} disabled={locked}>
            <IconPencil /> Edit
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {/* Read-only until Edit, but still easy to read (not faded). */}
        <fieldset
          disabled={!editing}
          className="min-w-0 [&_button[role=switch]:disabled]:opacity-100 [&_input:disabled]:cursor-default [&_input:disabled]:bg-muted/50 [&_input:disabled]:opacity-100"
        >
          {children}
        </fieldset>
        {editing && (
          <div className="mt-6 flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              <IconX /> Cancel
            </Button>
            <Button type="button" onClick={onSave} disabled={saving}>
              {saving ? <Spinner className="size-4 text-current" /> : <IconDeviceFloppy />} Save {title}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { data, isLoading, error, refetch } = useSettings();
  const save = useSaveSettings();
  const { register, control, handleSubmit, reset } = useForm<FormValues>();
  // The section being edited; one at a time, so saving never overwrites another section's edits.
  const [editing, setEditing] = useState<SectionId | null>(null);

  useEffect(() => {
    if (data) {
      const { _id, ...rest } = data;
      void _id;
      reset(rest);
    }
  }, [data, reset]);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const { _id: _savedId, ...saved } = data;
  void _savedId;
  const cancel = () => {
    reset(saved);
    setEditing(null);
  };
  const saveSection = (id: SectionId) =>
    void handleSubmit((values) => {
      const next = { ...saved, ...Object.fromEntries(SECTION_KEYS[id].map((k) => [k, values[k]])) } as FormValues;
      return confirmAction({
        title: `Save ${SECTION_TITLE[id].toLowerCase()}?`,
        description:
          id === 'shop' || id === 'social'
            ? 'The website shows the new details straight away.'
            : 'This changes the website and new orders straight away. Existing orders keep their totals.',
        confirmLabel: 'Save',
        action: () =>
          save.mutateAsync({
            shop: next.shop,
            social: next.social,
            tax: next.tax,
            delivery: next.delivery,
            payments: next.payments,
            sensitiveRetentionDays: next.sensitiveRetentionDays,
          }),
        successTitle: `${SECTION_TITLE[id]} saved`,
      }).then((ok) => {
        if (ok) setEditing(null);
      });
    })();
  const sectionProps = (id: SectionId) => ({
    title: SECTION_TITLE[id],
    editing: editing === id,
    locked: editing !== null && editing !== id,
    saving: save.isPending && editing === id,
    onEdit: () => setEditing(id),
    onCancel: cancel,
    onSave: () => saveSection(id),
  });

  return (
    <form onSubmit={(e) => e.preventDefault()}>
      <PageHeader
        icon={<IconSettings />}
        title="Settings"
        description="Shop details shown on the website, tax, delivery and payments. Press Edit on a section to change it."
      />
      <div className="flex flex-col gap-6">
        <div className="contents">
          <Section icon={<IconBuildingStore />} description="Shown in the website footer, contact page and messages." {...sectionProps('shop')}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
              <div className="sm:col-span-2 xl:col-span-3">
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
              <Field label="Registered business name" hint="As on your GST or shop registration, if different from the shop name. Shown in the website footer.">
                <Input {...register('shop.legalName')} />
              </Field>
              <Field label="Grievance officer" hint="E-commerce rules ask online shops to name a person customers can escalate complaints to. Shown at the bottom of every page of the website.">
                <Input placeholder="Name and designation, e.g. R. Sharma (Proprietor)" {...register('shop.grievanceName')} />
              </Field>
              <Field label="Grievance officer email">
                <Input type="email" {...register('shop.grievanceEmail')} />
              </Field>
              <Field label="Grievance officer phone">
                <Input inputMode="tel" {...register('shop.grievancePhone')} />
              </Field>
              <Field label="State (GST registration)" hint="Same state as the customer = CGST + SGST, otherwise IGST">
                <Input placeholder="Uttar Pradesh" {...register('shop.state')} />
              </Field>
            </div>
          </Section>

          <Section icon={<IconShare />} description="Shown as icons in the website footer and on the contact page. Leave empty to hide." {...sectionProps('social')}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
            </div>
          </Section>
        </div>

        <div className="contents">
          <Section icon={<IconReceiptTax />} description="Whether GST is charged and how it shows on prices and invoices." {...sectionProps('tax')}>
            <div className="space-y-4">
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
            </div>
          </Section>

          <Section icon={<IconTruckDelivery />} description="Home delivery charges and the ways customers can pay." {...sectionProps('delivery')}>
            <div className="space-y-4">
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
            </div>
          </Section>

          <Section icon={<IconShieldLock />} description="How long identity documents are kept." {...sectionProps('privacy')}>
              <Field label="Delete identity documents after (days)" hint="Counted from when the order is delivered or picked up">
                <Input type="number" min={1} max={365} {...register('sensitiveRetentionDays', { valueAsNumber: true })} />
              </Field>
          </Section>
        </div>
      </div>
    </form>
  );
}
