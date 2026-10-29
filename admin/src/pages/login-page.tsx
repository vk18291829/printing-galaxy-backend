import { IconLock } from '@tabler/icons-react';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Spinner } from '@/components/common/states';
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
    <div className="navy-panel grid min-h-dvh place-items-center p-4">
      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center text-white">
          {/* Light-ink mark: the background here is always navy. */}
          <img src="/logo-mark-dark.png?v=3" alt="" width={80} height={80} className="mb-4 size-20 object-contain drop-shadow-xl" />
          <h1 className="text-2xl font-bold tracking-tight">
            Printing <span className="text-brand-amber">Galaxy</span> Admin
          </h1>
          <p className="mt-1 text-sm text-white/60">Staff and owner sign in</p>
        </div>
        <Card className="light-surface overflow-hidden pt-0">
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
