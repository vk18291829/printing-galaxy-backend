import { IconLock } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Spinner } from '@/components/common/states';
import { ThemeToggle } from '@/components/common/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStaffLogin } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { getErrorMessage } from '@/lib/api-client';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const status = useAuthStore((s) => s.status);
  const login = useStaffLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  if (status === 'authenticated') return <Navigate to={from} replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(from, { replace: true }) });
  };

  return (
    <div className="relative grid min-h-dvh place-items-center bg-gradient-to-br from-brand-navy via-[#16213a] to-[#1b2f5e] p-4">
      <div className="absolute inset-0 bg-grid opacity-10" />
      <div className="absolute top-4 right-4 text-white">
        <ThemeToggle />
      </div>
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          <span className="mb-4 grid size-16 place-items-center rounded-2xl bg-white shadow-xl">
            <img src="/logo.png" alt="" className="size-12 object-contain" />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Printing Galaxy Admin</h1>
          <p className="mt-1 text-sm text-white/60">Staff and owner sign in</p>
        </div>
        <Card className="overflow-hidden pt-0">
          <div className="h-1 cmyk-strip" />
          <CardContent className="pt-1">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {login.isError && <p className="text-sm text-destructive">{getErrorMessage(login.error)}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={login.isPending || !email || !password}>
                {login.isPending ? <Spinner className="size-4 text-current" /> : <IconLock />} Sign in
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
