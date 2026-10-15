import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { PageLoader } from '@/components/common/states';
import type { Principal } from '@/types/api';
import { useAuthStore } from './auth-store';

/** Redirects to sign-in (keeping the return path) unless a matching principal is signed in. */
export function RequireAuth({ children, kind }: { children: ReactNode; kind?: Principal['kind'] }) {
  const status = useAuthStore((s) => s.status);
  const principal = useAuthStore((s) => s.principal);
  const location = useLocation();

  if (status === 'loading') return <PageLoader />;
  if (!principal) {
    const to = kind === 'institution' ? '/institutions/login' : '/login';
    return <Navigate to={to} replace state={{ from: location.pathname + location.search }} />;
  }
  if (kind && principal.kind !== kind) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Sends signed-in visitors away from login/register pages. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const principal = useAuthStore((s) => s.principal);
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  if (principal) {
    return <Navigate to={from ?? (principal.kind === 'institution' ? '/institution' : '/')} replace />;
  }
  return <>{children}</>;
}
