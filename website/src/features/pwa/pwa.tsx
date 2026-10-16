import { IconDeviceMobileDown, IconWifiOff } from '@tabler/icons-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cachedShop, usePublicSettings } from '@/features/settings/api';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Registers the service worker (production only, so development never serves stale files). */
export function registerServiceWorker() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Show our own button instead of the browser's mini-infobar.
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

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export function InstallAppButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const available = useSyncExternalStore(subscribe, () => deferred !== null);
  if (!available) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      title={t('pwa.installDesc')}
      onClick={async () => {
        if (!deferred) return;
        await deferred.prompt();
        await deferred.userChoice.catch(() => undefined);
        deferred = null;
        notify();
      }}
    >
      <IconDeviceMobileDown /> {t('pwa.install')}
    </Button>
  );
}

function useOnline() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
  );
}

/** Offline: say so, and point to the shop counter, which works without internet. */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnline();
  const { data } = usePublicSettings();
  const [shop, setShop] = useState(cachedShop);
  useEffect(() => {
    if (data) setShop(data.shop);
  }, [data]);

  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-50 bg-zinc-950 px-4 py-2.5 text-sm text-white">
      <div className="container-page flex items-start gap-2 px-0">
        <IconWifiOff className="mt-0.5 size-4 shrink-0" />
        <p>
          {t('pwa.offline')}
          {shop?.address && (
            <>
              {' '}
              {t('pwa.counter', { address: shop.address })}
              {shop.phone && (
                <a href={`tel:+91${shop.phone}`} className="ml-1 font-semibold underline">
                  +91 {shop.phone}
                </a>
              )}
            </>
          )}
        </p>
      </div>
    </div>
  );
}
