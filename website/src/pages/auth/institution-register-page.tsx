import { zodResolver } from '@hookform/resolvers/zod';
import {
  IconArrowLeft,
  IconArrowRight,
  IconBriefcase,
  IconBuildingCommunity,
  IconSchool,
  IconUsersGroup,
  IconBook2,
  type Icon,
} from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { Controller, useForm, type FieldPath } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { PrefixedInput } from '@/components/common/prefixed-input';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInstitutionRegister } from '@/features/auth/api';
import { AuthStepper, OrgAuthLayout } from '@/features/auth/components/org-auth-layout';
import { PasswordInput, PasswordStrength } from '@/features/auth/components/password-input';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
  'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
];

const ORG_TYPES: { value: 'school' | 'college' | 'coaching' | 'enterprise'; icon: Icon }[] = [
  { value: 'school', icon: IconSchool },
  { value: 'college', icon: IconBook2 },
  { value: 'coaching', icon: IconUsersGroup },
  { value: 'enterprise', icon: IconBriefcase },
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

/** Fields validated before moving on from each step. */
const STEP_FIELDS: FieldPath<FormValues>[][] = [
  ['name', 'type', 'size', 'gstin'],
  ['contactName', 'designation', 'phone', 'email', 'password'],
  ['address.line1', 'address.line2', 'address.city', 'address.state', 'address.pincode'],
];

function Field({ label, error, children, hint, htmlFor }: { label: string; error?: string; children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export default function InstitutionRegisterPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.registerTitle'), { description: t('seo.registerDesc') });
  const navigate = useNavigate();
  const register = useInstitutionRegister();
  const [step, setStep] = useState(0);
  const stepLabels = [t('auth.sectionOrg'), t('auth.org.stepContact'), t('auth.sectionAddress')];
  const last = step === stepLabels.length - 1;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
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
  const password = form.watch('password');

  const next = async () => {
    if (await form.trigger(STEP_FIELDS[step], { shouldFocus: true })) setStep((s) => s + 1);
  };

  const onSubmit = form.handleSubmit(
    (values) => {
      register.mutate(
        {
          ...values,
          size: values.size ? Number(values.size) : undefined,
          gstin: values.gstin || undefined,
          designation: values.designation || undefined,
        },
        {
          onSuccess: () => {
            toast.success(t('auth.registered'), { description: t('toast.registeredDesc') });
            navigate('/institution', { replace: true });
          },
          onError: (e) => toast.error(getErrorMessage(e)),
        },
      );
    },
    // An error on an earlier step (e.g. the server rejected the email): jump back to it.
    (errs) => {
      const firstBad = STEP_FIELDS.findIndex((fields) => fields.some((f) => f.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], errs)));
      if (firstBad >= 0) setStep(firstBad);
    },
  );

  return (
    <OrgAuthLayout
      wide
      title={t('auth.registerTitle')}
      subtitle={t('auth.registerSubtitle')}
      footer={
        <p>
          {t('auth.haveAccount')}{' '}
          <Link to="/login?tab=institution" className="font-semibold text-primary hover:underline">
            {t('nav.institutionLogin')}
          </Link>
        </p>
      }
    >
      <AuthStepper step={step} labels={stepLabels} onJump={setStep} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (last) void onSubmit(e);
          else void next();
        }}
        className="space-y-6"
        noValidate
      >
        <p className="text-xs font-medium text-muted-foreground">
          {t('auth.org.stepOf', { current: step + 1, total: stepLabels.length })} · {stepLabels[step]}
        </p>

        {step === 0 && (
          <div className="space-y-5">
            <Field label={t('auth.orgName')} error={errors.name?.message} htmlFor="org-name">
              <Input id="org-name" autoFocus className="h-11" placeholder={t('auth.org.orgNamePlaceholder')} aria-invalid={!!errors.name} {...form.register('name')} />
            </Field>
            <div className="space-y-2">
              <Label>{t('auth.orgType')}</Label>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {ORG_TYPES.map(({ value, icon: TypeIcon }) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={field.value === value}
                        onClick={() => field.onChange(value)}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl shadow-card p-3 text-center text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                          field.value === value ? 'border-primary bg-primary/8 text-primary' : 'hover:bg-accent',
                        )}
                      >
                        <TypeIcon className="size-6" stroke={1.6} />
                        {t(`auth.types.${value}`)}
                      </button>
                    ))}
                  </div>
                )}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label={`${t('auth.size')} (${t('common.optional')})`} htmlFor="org-size">
                <Input id="org-size" type="number" inputMode="numeric" min={0} className="h-11" {...form.register('size')} />
              </Field>
              <Field label={`${t('auth.gstin')} (${t('common.optional')})`} error={errors.gstin?.message} htmlFor="org-gstin">
                <Input id="org-gstin" className="h-11 uppercase" maxLength={15} aria-invalid={!!errors.gstin} {...form.register('gstin')} />
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t('auth.contactName')} error={errors.contactName?.message} htmlFor="contact-name">
              <Input id="contact-name" autoFocus autoComplete="name" className="h-11" aria-invalid={!!errors.contactName} {...form.register('contactName')} />
            </Field>
            <Field label={`${t('auth.designation')} (${t('common.optional')})`} htmlFor="designation">
              <Input id="designation" className="h-11" placeholder={t('auth.designationPlaceholder')} {...form.register('designation')} />
            </Field>
            <Field label={t('auth.phone')} error={errors.phone?.message} htmlFor="phone">
              <PrefixedInput
                prefix="+91"
                id="phone"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                autoComplete="tel-national"
                aria-invalid={!!errors.phone}
                {...form.register('phone')}
              />
            </Field>
            <Field label={t('auth.org.workEmail')} error={errors.email?.message} htmlFor="email">
              <Input id="email" type="email" autoComplete="email" className="h-11" aria-invalid={!!errors.email} {...form.register('email')} />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label={t('auth.password')}
                error={errors.password ? t('auth.passwordHint') : undefined}
                htmlFor="password"
                hint={
                  <div className="space-y-2">
                    <PasswordStrength value={password} />
                    <p>{t('auth.passwordHint')}</p>
                  </div>
                }
              >
                <PasswordInput id="password" autoComplete="new-password" className="h-11" aria-invalid={!!errors.password} {...form.register('password')} />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label={t('auth.line1')} error={errors.address?.line1?.message} htmlFor="line1">
                <Input id="line1" autoFocus autoComplete="address-line1" className="h-11" aria-invalid={!!errors.address?.line1} {...form.register('address.line1')} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label={`${t('auth.line2')} (${t('common.optional')})`} htmlFor="line2">
                <Input id="line2" autoComplete="address-line2" className="h-11" {...form.register('address.line2')} />
              </Field>
            </div>
            <Field label={t('auth.city')} error={errors.address?.city?.message} htmlFor="city">
              <Input id="city" autoComplete="address-level2" className="h-11" aria-invalid={!!errors.address?.city} {...form.register('address.city')} />
            </Field>
            <Field label={t('auth.pincode')} error={errors.address?.pincode?.message} htmlFor="pincode">
              <Input id="pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" className="h-11" aria-invalid={!!errors.address?.pincode} {...form.register('address.pincode')} />
            </Field>
            <div className="sm:col-span-2">
              <Field label={t('auth.state')}>
                <Controller
                  control={form.control}
                  name="address.state"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-11 w-full">
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
            </div>
            <div className="rounded-xl shadow-card bg-muted/40 p-4 text-sm sm:col-span-2">
              <p className="mb-2 font-semibold">{t('auth.org.reviewTitle')}</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted-foreground">
                <dt>{t('auth.orgName')}</dt>
                <dd className="truncate text-foreground">
                  {form.getValues('name')} · {t(`auth.types.${form.getValues('type')}`)}
                </dd>
                <dt>{t('auth.contactName')}</dt>
                <dd className="truncate text-foreground">
                  {form.getValues('contactName')} · +91 {form.getValues('phone')}
                </dd>
                <dt>{t('auth.email')}</dt>
                <dd className="truncate text-foreground">{form.getValues('email')}</dd>
              </dl>
              <p className="mt-3 text-xs">{t('auth.org.termsNote')}</p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          {step > 0 && (
            <Button type="button" variant="outline" size="lg" onClick={() => setStep((s) => s - 1)}>
              <IconArrowLeft /> {t('common.back')}
            </Button>
          )}
          <Button type="submit" size="lg" variant="brand" className="flex-1" disabled={register.isPending}>
            {register.isPending && <Spinner className="size-4 text-current" />}
            {last ? (
              <>
                <IconBuildingCommunity /> {t('auth.submitRegister')}
              </>
            ) : (
              <>
                {t('common.continue')} <IconArrowRight />
              </>
            )}
          </Button>
        </div>
      </form>
    </OrgAuthLayout>
  );
}
