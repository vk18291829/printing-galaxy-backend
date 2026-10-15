import { zodResolver } from '@hookform/resolvers/zod';
import { IconBuildingCommunity } from '@tabler/icons-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInstitutionLogin } from '@/features/auth/api';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage } from '@/lib/api-client';

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export default function InstitutionLoginPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('auth.institutionLoginTitle'));
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/institution';
  const login = useInstitutionLogin();

  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  const onSubmit = form.handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate(from, { replace: true }) }),
  );

  return (
    <AuthShell
      icon={<IconBuildingCommunity />}
      title={t('auth.institutionLoginTitle')}
      subtitle={t('auth.institutionLoginSubtitle')}
      footer={
        <>
          <p>
            {t('auth.noAccount')}{' '}
            <Link to="/institutions/register" className="font-semibold text-primary hover:underline">
              {t('institutions.register')}
            </Link>
          </p>
          <p>
            {t('auth.individualPrompt')}{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              {t('auth.individualLink')}
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.email')}</Label>
          <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!form.formState.errors.email} {...form.register('email')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t('auth.password')}</Label>
          <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!form.formState.errors.password} {...form.register('password')} />
        </div>
        {login.isError && <p className="text-sm text-destructive">{getErrorMessage(login.error)}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={login.isPending}>
          {login.isPending && <Spinner className="size-4 text-current" />}
          {t('common.signIn')}
        </Button>
      </form>
    </AuthShell>
  );
}
