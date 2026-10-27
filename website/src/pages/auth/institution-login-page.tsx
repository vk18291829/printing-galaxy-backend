import { zodResolver } from '@hookform/resolvers/zod';
import { IconArrowRight, IconBuildingCommunity, IconLogin2 } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';
import { Spinner } from '@/components/common/states';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInstitutionLogin } from '@/features/auth/api';
import { OrgAuthLayout } from '@/features/auth/components/org-auth-layout';
import { PasswordInput } from '@/features/auth/components/password-input';
import { getErrorMessage } from '@/lib/api-client';

const schema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

/** Schools & colleges tab of the sign-in page (email + password). */
export function InstitutionLogin({ tabs }: { tabs: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/institution';
  const login = useInstitutionLogin();

  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });
  const errors = form.formState.errors;

  const onSubmit = form.handleSubmit((values) => login.mutate(values, { onSuccess: () => navigate(from, { replace: true }) }));

  return (
    <OrgAuthLayout
      brief
      title={t('auth.org.loginTitle')}
      subtitle={t('auth.org.loginSubtitle')}
      header={tabs}
      footer={
        <>
          <p>
            {t('auth.org.needHelp')}{' '}
            <Link to="/contact" className="font-semibold text-primary hover:underline">
              {t('auth.org.contactUs')}
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">{t('auth.org.workEmail')}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="admin@school.edu.in"
            className="h-11"
            aria-invalid={!!errors.email}
            {...form.register('email')}
          />
          {errors.email && <p className="text-xs text-destructive">{t('auth.org.emailInvalid')}</p>}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="password">{t('auth.password')}</Label>
            <Link to="/institutions/forgot-password" className="text-sm font-medium text-primary hover:underline">
              {t('auth.forgotPassword')}
            </Link>
          </div>
          <PasswordInput id="password" autoComplete="current-password" className="h-11" aria-invalid={!!errors.password} {...form.register('password')} />
          {errors.password && <p className="text-xs text-destructive">{t('auth.org.passwordRequired')}</p>}
        </div>
        {login.isError && (
          <Alert variant="destructive">
            <AlertDescription>{getErrorMessage(login.error)}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" size="lg" variant="brand" className="w-full" disabled={login.isPending}>
          {login.isPending ? <Spinner className="size-4 text-current" /> : <IconLogin2 />}
          {t('common.signIn')}
        </Button>
      </form>

      <div className="mt-6 flex items-center gap-4 rounded-xl border border-dashed p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <IconBuildingCommunity className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t('auth.noAccount')}</p>
          <p className="text-xs text-muted-foreground">{t('auth.org.registerPitch')}</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/institutions/register">
            {t('common.register')} <IconArrowRight />
          </Link>
        </Button>
      </div>
    </OrgAuthLayout>
  );
}
