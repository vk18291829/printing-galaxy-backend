import { IconDeviceMobileDown, IconDotsVertical, IconShare2, IconSquarePlus, IconWifiOff } from '@tabler/icons-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cachedShop, usePublicSettings } from '@/features/settings/api';
import { cn } from '@/lib/utils';

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

/** Already running as the installed app (home-screen icon), where an install button makes no sense. */
const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * "Install app", always offered until the app is installed. Where the browser can install directly
 * (Android Chrome, desktop Chrome/Edge) it opens the browser's prompt; elsewhere (iPhone Safari,
 * Firefox, or before Chrome is ready) it shows the two steps to add it to the home screen.
 * `variant="pill"` is the small header button on phones, `variant="link"` the text link in the top strip.
 */
export function InstallAppButton({ className, variant = 'button' }: { className?: string; variant?: 'button' | 'pill' | 'link' }) {
  const { t } = useTranslation();
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null);
  const [installed, setInstalled] = useState(isInstalled);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const off = subscribe(() => setInstalled(isInstalled()));
    return () => void off();
  }, []);
  if (installed) return null;

  const install = async () => {
    if (!canPrompt || !deferred) return setHelp(true);
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    deferred = null;
    notify();
  };
  const ios = isIos();

  return (
    <>
      {variant === 'link' ? (
        <button type="button" onClick={() => void install()} className={cn('inline-flex shrink-0 items-center gap-1.5 font-medium', className)}>
          <IconDeviceMobileDown className="size-3.5" /> {t('pwa.install')}
        </button>
      ) : (
        <Button
          variant={variant === 'pill' ? 'secondary' : 'outline'}
          size="sm"
          className={cn(variant === 'pill' && 'h-8 rounded-full px-3 text-xs font-semibold text-primary', className)}
          title={t('pwa.installDesc')}
          onClick={() => void install()}
        >
          <IconDeviceMobileDown /> {variant === 'pill' ? t('pwa.getApp') : t('pwa.install')}
        </Button>
      )}

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('pwa.howTitle')}</DialogTitle>
            <DialogDescription>{t('pwa.installDesc')}</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            {[
              { icon: ios ? IconShare2 : IconDotsVertical, text: t(ios ? 'pwa.iosStep1' : 'pwa.otherStep1') },
              { icon: IconSquarePlus, text: t(ios ? 'pwa.iosStep2' : 'pwa.otherStep2') },
            ].map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-muted p-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-card text-primary">
                  <Icon className="size-5" />
                </span>
                <span>
                  <span className="font-semibold">{i + 1}.</span> {text}
                </span>
              </li>
            ))}
          </ol>
          <Button className="w-full" onClick={() => setHelp(false)}>
            {t('pwa.gotIt')}
          </Button>
        </DialogContent>
      </Dialog>
    </>
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
    <div role="status" className="sticky top-0 z-50 bg-brand-navy px-4 py-2.5 text-sm text-white">
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
