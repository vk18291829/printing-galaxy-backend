import { IconArrowLeft, IconDeviceMobile, IconInfoCircle } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi, useVerifyOtp, type OtpRequestResponse } from '@/features/auth/api';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { OtpInput } from '@/features/auth/components/otp-input';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage } from '@/lib/api-client';

const PHONE_RE = /^[6-9]\d{9}$/;

export default function LoginPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('common.signIn'));
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [phone, setPhone] = useState('');
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
  const phoneValid = PHONE_RE.test(cleanPhone);

  const submitPhone = (e: FormEvent) => {
    e.preventDefault();
    if (phoneValid) request.mutate(cleanPhone);
  };

  const submitCode = (e?: FormEvent) => {
    e?.preventDefault();
    if (code.length !== 6) return;
    verify.mutate(
      { phone: cleanPhone, code, name: name.trim() || undefined },
      {
        onSuccess: (data) => {
          toast.success(data.isNew ? t('auth.welcome') : t('auth.welcomeBack'));
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

  return (
    <AuthShell
      icon={<IconDeviceMobile />}
      title={sent ? t('auth.otpTitle') : t('auth.loginTitle')}
      subtitle={sent ? t('auth.otpSent', { phone: cleanPhone }) : t('auth.loginSubtitle')}
      footer={
        <>
          <p>
            {t('auth.institutionPrompt')}{' '}
            <Link to="/institutions/login" className="font-semibold text-primary hover:underline">
              {t('nav.institutionLogin')}
            </Link>
          </p>
        </>
      }
    >
      {!sent ? (
        <form onSubmit={submitPhone} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="phone">{t('auth.phone')}</Label>
            <div className="flex">
              <span className="flex items-center rounded-l-lg border border-r-0 bg-muted px-3 text-sm font-medium text-muted-foreground">
                +91
              </span>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                autoFocus
                placeholder={t('auth.phonePlaceholder')}
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12))}
                className="h-12 rounded-l-none text-lg tracking-wide"
              />
            </div>
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={!phoneValid || request.isPending}>
            {request.isPending && <Spinner className="size-4 text-current" />}
            {t('auth.sendOtp')}
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
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={code.length !== 6 || verify.isPending}>
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
              <IconArrowLeft className="size-4" /> {t('auth.changeNumber')}
            </button>
            <button
              type="button"
              disabled={cooldown > 0 || request.isPending}
              onClick={() => request.mutate(cleanPhone)}
              className="font-semibold text-primary disabled:font-normal disabled:text-muted-foreground"
            >
              {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
            </button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
