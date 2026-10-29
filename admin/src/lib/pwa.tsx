import { IconDeviceMobileDown, IconDotsVertical, IconShare2, IconSquarePlus } from '@tabler/icons-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

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
/** A new release is running in the background: offer a reload so this screen picks it up. */
function announceUpdate() {
  toast('A new version is ready', {
    id: 'app-update',
    description: 'Reload to use it. Anything you are typing is kept until you reload.',
    duration: Infinity,
    action: { label: 'Reload', onClick: () => window.location.reload() },
  });
}

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
    window.addEventListener('load', () => {
      // A worker already in charge means the next takeover is a new release, not the first install.
      const updating = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', () => updating && announceUpdate());
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // The installed app can stay open for days: look for a release whenever it comes back to the front.
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') void registration.update().catch(() => undefined);
          });
        })
        .catch(() => undefined);
    });
  }
}

/** Already running as the installed app (home-screen icon), where an install button makes no sense. */
const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * "Install app", always offered until the app is installed. Where the browser can install directly
 * (Android Chrome, desktop Chrome/Edge) it opens the browser's prompt; elsewhere (iPhone Safari,
 * Firefox, or before Chrome is ready) it shows the two steps to add it to the home screen.
 * `pill` is the small header button on phones.
 */
export function InstallAppButton({ className, pill = false }: { className?: string; pill?: boolean }) {
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
  const steps = ios
    ? [
        { icon: IconShare2, text: 'Tap the Share button at the bottom of Safari.' },
        { icon: IconSquarePlus, text: 'Choose “Add to Home Screen”, then tap Add.' },
      ]
    : [
        { icon: IconDotsVertical, text: 'Open your browser menu (⋮ at the top right).' },
        { icon: IconSquarePlus, text: 'Tap “Install app” or “Add to Home screen”.' },
      ];

  return (
    <>
      <Button
        variant={pill ? 'secondary' : 'outline'}
        size="sm"
        className={cn(pill && 'h-8 rounded-full px-3 text-xs font-semibold text-primary', className)}
        onClick={() => void install()}
      >
        <IconDeviceMobileDown /> {pill ? 'Get app' : 'Install app'}
      </Button>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Install the admin app</DialogTitle>
            <DialogDescription>Open orders, proofs and deliveries from your home screen, like any other app.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            {steps.map(({ icon: Icon, text }, i) => (
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
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
