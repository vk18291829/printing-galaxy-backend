import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { refreshSession } from '@/lib/api-client';
import { queryClient } from '@/lib/query-client';

/** Restores the session from the httpOnly refresh cookie on first load. */
function SessionBootstrap() {
  useEffect(() => {
    void refreshSession();
  }, []);
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionBootstrap />
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
