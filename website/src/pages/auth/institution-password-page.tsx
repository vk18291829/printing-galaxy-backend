import { IconArrowLeft, IconKey, IconSend } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OrgAuthLayout } from '@/features/auth/components/org-auth-layout';
import { OtpInput } from '@/features/auth/components/otp-input';
import { PasswordInput, PasswordStrength } from '@/features/auth/components/password-input';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { api, getErrorMessage } from '@/lib/api-client';

interface ForgotResponse {
  sent: boolean;
  phoneHint?: string;
  sentTo?: 'email' | 'phone';
  devCode?: string;
}

/** Institution password reset: email → code to the phone on the account → new password. */
export default function InstitutionPasswordPage() {
  const { t, i18n } = useTranslation();
  const byEmail = usePublicSettings().data?.messaging !== 'sms';
  useDocumentTitle(t('auth.resetTitle'));
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<ForgotResponse | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const request = useMutation({
    mutationFn: async () => (await api.post<ForgotResponse>('/auth/institution/password/forgot', { email, lang: i18n.language })).data,
    onSuccess: (data) => setSent(data),
  });
  const reset = useMutation({
    mutationFn: async () => (await api.post('/auth/institution/password/reset', { email, code, password })).data,
    onSuccess: () => {
      toast.success(t('auth.resetDone'), { description: t('toast.resetDoneDesc') });
      navigate('/login?tab=institution', { replace: true });
    },
  });

  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <OrgAuthLayout
      title={t('auth.resetTitle')}
      subtitle={byEmail ? t('auth.resetSubtitleEmail') : t('auth.resetSubtitle')}
      footer={
        <Link to="/login?tab=institution" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          <IconArrowLeft className="size-4" /> {t('auth.backToLogin')}
        </Link>
      }
    >
      {!sent ? (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (emailValid) request.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="email">{t('auth.org.workEmail')}</Label>
            <Input id="email" type="email" autoComplete="email" autoFocus className="h-11" placeholder="admin@school.edu.in" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {request.isError && (
            <Alert variant="destructive">
              <AlertDescription>{getErrorMessage(request.error)}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" size="lg" variant="brand" className="w-full" disabled={!emailValid || request.isPending}>
            {request.isPending ? <Spinner className="size-4 text-current" /> : <IconSend />}
            {t('auth.sendResetCode')}
          </Button>
        </form>
      ) : (
        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            reset.mutate();
          }}
        >
          <Alert variant="info">
            <AlertDescription className="text-foreground">
              {sent.sentTo === 'email' ? t('auth.resetCodeSentEmail') : sent.phoneHint ? t('auth.resetCodeSent', { phone: sent.phoneHint }) : t('auth.resetCodeSentGeneric')}
            </AlertDescription>
          </Alert>
          {sent.devCode && <p className="text-center text-xs text-muted-foreground">{t('auth.devCode', { code: sent.devCode })}</p>}
          <div className="space-y-2">
            <Label>{t('auth.code')}</Label>
            <OtpInput value={code} onChange={setCode} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('auth.newPassword')}</Label>
            <PasswordInput id="password" autoComplete="new-password" className="h-11" value={password} onChange={(e) => setPassword(e.target.value)} />
            <PasswordStrength value={password} />
          </div>
          {reset.isError && (
            <Alert variant="destructive">
              <AlertDescription>{getErrorMessage(reset.error)}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" size="lg" variant="brand" className="w-full" disabled={code.length !== 6 || password.length < 8 || reset.isPending}>
            {reset.isPending ? <Spinner className="size-4 text-current" /> : <IconKey />}
            {t('auth.resetPassword')}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={() => { setSent(null); setCode(''); }}>
            {t('auth.changeEmail')}
          </Button>
        </form>
      )}
    </OrgAuthLayout>
  );
}
