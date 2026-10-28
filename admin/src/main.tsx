import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from '@/app/router';
import { ThemeProvider } from '@/components/theme-provider';
import { ConfirmHost } from '@/components/common/confirm-dialog';
import { Toaster } from '@/components/ui/sonner';
import { refreshSession } from '@/lib/api-client';
import { registerServiceWorker } from '@/lib/pwa';
import { handleStaleBuilds } from '@/lib/stale-build';
import { queryClient } from '@/lib/query-client';
import '@/styles/globals.css';

registerServiceWorker();
handleStaleBuilds();

function SessionBootstrap() {
  useEffect(() => {
    void refreshSession();
  }, []);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionBootstrap />
        <RouterProvider router={router} />
        <Toaster />
        <ConfirmHost />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
