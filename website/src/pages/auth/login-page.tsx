import { IconArrowLeft, IconArrowRight, IconBuildingCommunity, IconInfoCircle, IconShieldCheck, IconUser } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { PrefixedInput } from '@/components/common/prefixed-input';
import { PageLoader, Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { authApi, useVerifyOtp, type OtpRequestResponse } from '@/features/auth/api';
import { OrgAuthLayout } from '@/features/auth/components/org-auth-layout';
import { OtpInput } from '@/features/auth/components/otp-input';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { InstitutionLogin } from '@/pages/auth/institution-login-page';
import { getErrorMessage } from '@/lib/api-client';

const PHONE_RE = /^[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type LoginTab = 'individual' | 'institution';

/** One sign-in page with a tab per account type; `?tab=institution` opens the schools tab. */
export default function LoginPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('common.signIn'));
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const tab: LoginTab = params.get('tab') === 'institution' ? 'institution' : 'individual';

  const tabs = (
    <Tabs
      value={tab}
      // Keep the return path (router state) when switching tabs.
      onValueChange={(v) => setParams(v === 'institution' ? { tab: v } : {}, { replace: true, state: location.state })}
      className="mb-8"
    >
      <TabsList className="w-full">
        <TabsTrigger value="individual">
          <IconUser /> {t('auth.tabs.individual')}
        </TabsTrigger>
        <TabsTrigger value="institution">
          <IconBuildingCommunity /> {t('auth.tabs.institution')}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return tab === 'institution' ? <InstitutionLogin tabs={tabs} /> : <IndividualLogin tabs={tabs} />;
}

function IndividualLogin({ tabs }: { tabs: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const settings = usePublicSettings();
  // The server decides: email codes (Gmail) or SMS codes (MSG91).
  const byEmail = settings.data?.messaging !== 'sms';
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState<OtpRequestResponse | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const request = useMutation({
    mutationFn: authApi.requestOtp,
    onSuccess: (data) => {
      setSent(data);
      setCode('');
      setCooldown(data.resendInSeconds);
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const verify = useVerifyOtp();

  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const cleanEmail = email.trim().toLowerCase();
  const target = byEmail ? { email: cleanEmail } : { phone: cleanPhone };
  const targetValid = byEmail ? EMAIL_RE.test(cleanEmail) : PHONE_RE.test(cleanPhone);

  const submitTarget = (e: FormEvent) => {
    e.preventDefault();
    if (targetValid) request.mutate(target);
  };

  const submitCode = (e?: FormEvent) => {
    e?.preventDefault();
    if (code.length !== 6) return;
    verify.mutate(
      { ...target, code, name: name.trim() || undefined },
      {
        onSuccess: (data) => {
          const to = data.kind === 'user' ? (data.user.email ?? (data.user.phone ? `+91 ${data.user.phone}` : '')) : '';
          toast.success(data.isNew ? t('auth.welcome') : t('auth.welcomeBack'), {
            description: to ? t(data.isNew ? 'toast.welcomeDesc' : 'toast.welcomeBackDesc', { to }) : undefined,
          });
          navigate(from, { replace: true });
        },
      },
    );
  };

  // Submit automatically once all six digits are in.
  useEffect(() => {
    if (code.length === 6 && sent && !verify.isPending) submitCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  if (settings.isLoading) return <PageLoader />;

  return (
    <OrgAuthLayout
      audience="individual"
      brief
      title={sent ? t('auth.otpTitle') : byEmail ? t('auth.byEmail.loginTitle') : t('auth.loginTitle')}
      subtitle={
        sent
          ? byEmail
            ? t('auth.byEmail.otpSent', { email: cleanEmail })
            : t('auth.otpSent', { phone: cleanPhone })
          : byEmail
            ? t('auth.byEmail.loginSubtitle')
            : t('auth.loginSubtitle')
      }
      header={tabs}
    >
      {!sent ? (
        <form onSubmit={submitTarget} className="space-y-5">
          {byEmail ? (
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.byEmail.email')}</Label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                placeholder={t('auth.byEmail.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value.slice(0, 120))}
                className="h-12 text-lg"
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <IconShieldCheck className="size-3.5 text-success" /> {t('auth.byEmail.privacy')}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="phone">{t('auth.phone')}</Label>
              <PrefixedInput
                prefix="+91"
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                autoFocus
                placeholder={t('auth.phonePlaceholder')}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12))}
                className="h-12 [&_input]:text-lg [&_input]:tracking-wide"
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <IconShieldCheck className="size-3.5 text-success" /> {t('auth.person.privacy')}
              </p>
            </div>
          )}
          <Button type="submit" size="lg" variant="brand" className="w-full" disabled={!targetValid || request.isPending}>
            {request.isPending && <Spinner className="size-4 text-current" />}
            {t('auth.sendOtp')} {!request.isPending && <IconArrowRight />}
          </Button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="space-y-5">
          {sent.devCode && (
            <Alert variant="info">
              <IconInfoCircle />
              <AlertDescription className="text-foreground">{t('auth.devCode', { code: sent.devCode })}</AlertDescription>
            </Alert>
          )}
          <OtpInput value={code} onChange={setCode} disabled={verify.isPending} invalid={verify.isError} />
          {verify.isError && <p className="text-center text-sm text-destructive">{getErrorMessage(verify.error)}</p>}
          <div className="space-y-2">
            <Label htmlFor="name">
              {t('auth.name')} <span className="font-normal text-muted-foreground">({t('auth.namePlaceholder')})</span>
            </Label>
            <Input id="name" autoComplete="name" className="h-11" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <Button type="submit" size="lg" variant="brand" className="w-full" disabled={code.length !== 6 || verify.isPending}>
            {verify.isPending && <Spinner className="size-4 text-current" />}
            {t('auth.verify')}
          </Button>
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSent(null);
                verify.reset();
              }}
            >
              <IconArrowLeft className="size-4" /> {byEmail ? t('auth.byEmail.changeEmail') : t('auth.changeNumber')}
            </button>
            <button
              type="button"
              disabled={cooldown > 0 || request.isPending}
              onClick={() => request.mutate(target)}
              className="font-semibold text-primary disabled:font-normal disabled:text-muted-foreground"
            >
              {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
            </button>
          </div>
        </form>
      )}
    </OrgAuthLayout>
  );
}
