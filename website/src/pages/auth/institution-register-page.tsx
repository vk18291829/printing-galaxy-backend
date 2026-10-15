import { zodResolver } from '@hookform/resolvers/zod';
import { IconBuildingCommunity } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useInstitutionRegister } from '@/features/auth/api';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage } from '@/lib/api-client';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

const schema = z.object({
  name: z.string().trim().min(3).max(150),
  type: z.enum(['school', 'college', 'coaching', 'enterprise']),
  size: z.string().optional(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => !v || /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v), 'Invalid GSTIN')
    .optional(),
  contactName: z.string().trim().min(2).max(80),
  designation: z.string().trim().max(80).optional(),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, '10-digit mobile number'),
  email: z.string().trim().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Za-z]/)
    .regex(/\d/),
  address: z.object({
    line1: z.string().trim().min(3),
    line2: z.string().trim().optional(),
    city: z.string().trim().min(2),
    state: z.string().min(2),
    pincode: z.string().trim().regex(/^\d{6}$/, '6-digit PIN code'),
  }),
});
type FormValues = z.infer<typeof schema>;

function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function InstitutionRegisterPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.registerTitle'));
  const navigate = useNavigate();
  const register = useInstitutionRegister();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      type: 'school',
      contactName: '',
      phone: '',
      email: '',
      password: '',
      address: { line1: '', city: '', state: 'Uttar Pradesh', pincode: '' },
    },
  });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => {
    register.mutate(
      {
        ...values,
        size: values.size ? Number(values.size) : undefined,
        gstin: values.gstin || undefined,
        designation: values.designation || undefined,
      },
      {
        onSuccess: () => {
          toast.success(t('auth.registered'));
          navigate('/institution', { replace: true });
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  });

  return (
    <AuthShell
      wide
      icon={<IconBuildingCommunity />}
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <p>
          {t('auth.haveAccount')}{' '}
          <Link to="/institutions/login" className="font-semibold text-primary hover:underline">
            {t('nav.institutionLogin')}
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-8 py-2" noValidate>
        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide text-primary uppercase">{t('auth.sectionOrg')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t('auth.orgName')} error={errors.name?.message}>
                <Input autoFocus aria-invalid={!!errors.name} {...form.register('name')} />
              </Field>
            </div>
            <Field label={t('auth.orgType')}>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(['school', 'college', 'coaching', 'enterprise'] as const).map((type) => (
                        <SelectItem key={type} value={type}>
                          {t(`auth.types.${type}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={`${t('auth.size')} (${t('common.optional')})`}>
              <Input type="number" inputMode="numeric" min={0} {...form.register('size')} />
            </Field>
            <Field label={`${t('auth.gstin')} (${t('common.optional')})`} error={errors.gstin?.message}>
              <Input className="uppercase" maxLength={15} aria-invalid={!!errors.gstin} {...form.register('gstin')} />
            </Field>
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide text-primary uppercase">{t('auth.sectionContact')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('auth.contactName')} error={errors.contactName?.message}>
              <Input autoComplete="name" aria-invalid={!!errors.contactName} {...form.register('contactName')} />
            </Field>
            <Field label={`${t('auth.designation')} (${t('common.optional')})`}>
              <Input placeholder={t('auth.designationPlaceholder')} {...form.register('designation')} />
            </Field>
            <Field label={t('auth.phone')} error={errors.phone?.message}>
              <Input type="tel" inputMode="numeric" maxLength={10} autoComplete="tel-national" aria-invalid={!!errors.phone} {...form.register('phone')} />
            </Field>
            <Field label={t('auth.email')} error={errors.email?.message}>
              <Input type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register('email')} />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('auth.password')} error={errors.password ? t('auth.passwordHint') : undefined} hint={t('auth.passwordHint')}>
                <Input type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register('password')} />
              </Field>
            </div>
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide text-primary uppercase">{t('auth.sectionAddress')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t('auth.line1')} error={errors.address?.line1?.message}>
                <Input autoComplete="address-line1" aria-invalid={!!errors.address?.line1} {...form.register('address.line1')} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={`${t('auth.line2')} (${t('common.optional')})`}>
                <Input autoComplete="address-line2" {...form.register('address.line2')} />
              </Field>
            </div>
            <Field label={t('auth.city')} error={errors.address?.city?.message}>
              <Input autoComplete="address-level2" aria-invalid={!!errors.address?.city} {...form.register('address.city')} />
            </Field>
            <Field label={t('auth.state')}>
              <Controller
                control={form.control}
                name="address.state"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INDIAN_STATES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field label={t('auth.pincode')} error={errors.address?.pincode?.message}>
              <Input inputMode="numeric" maxLength={6} autoComplete="postal-code" aria-invalid={!!errors.address?.pincode} {...form.register('address.pincode')} />
            </Field>
          </div>
        </section>

        <Button type="submit" size="lg" variant="brand" className="w-full" disabled={register.isPending}>
          {register.isPending && <Spinner className="size-4 text-current" />}
          {t('auth.submitRegister')}
        </Button>
      </form>
    </AuthShell>
  );
}
