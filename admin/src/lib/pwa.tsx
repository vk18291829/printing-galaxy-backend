import { IconDeviceMobileDown } from '@tabler/icons-react';
import { useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Registers the service worker (production only) and keeps the browser's install offer for our button. */
export function registerServiceWorker() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
  }
}

/** "Install app": shown only when the browser offers it (Android Chrome, desktop Chrome/Edge). */
export function InstallAppButton({ className }: { className?: string }) {
  const available = useSyncExternalStore(subscribe, () => deferred !== null);
  if (!available) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      onClick={async () => {
        if (!deferred) return;
        await deferred.prompt();
        await deferred.userChoice.catch(() => undefined);
        deferred = null;
        notify();
      }}
    >
      <IconDeviceMobileDown /> Install app
    </Button>
  );
}
