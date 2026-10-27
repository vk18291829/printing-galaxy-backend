import { IconBell, IconBellOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { api, getErrorMessage } from '@/lib/api-client';

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyToBytes(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
}

/**
 * "Turn on notifications" for this phone or computer: new orders, proof replies and accepted
 * quotes, filtered by the person's roles on the server. Hidden when the browser can't do it or the
 * server has no push keys yet.
 */
export function PushToggle({ className }: { className?: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported()) return;
    void api.get<{ publicKey: string | null }>('/admin/push/key').then((r) => setKey(r.data.publicKey)).catch(() => undefined);
    void navigator.serviceWorker.getRegistration().then((reg) => reg?.pushManager.getSubscription()).then((sub) => setOn(Boolean(sub)));
  }, []);

  if (!supported() || !key) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (on && existing) {
        await api.post('/admin/push/unsubscribe', { endpoint: existing.endpoint });
        await existing.unsubscribe();
        setOn(false);
        toast.success('Notifications off on this device');
        return;
      }
      if ((await Notification.requestPermission()) !== 'granted') {
        toast.error('Notifications are blocked. Allow them in the browser settings for this site.');
        return;
      }
      const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key) }));
      await api.post('/admin/push/subscribe', sub.toJSON());
      setOn(true);
      toast.success('Notifications on', { description: 'New orders and proof replies will show on this device.' });
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" className={className} onClick={() => void toggle()} disabled={busy}>
      {busy ? <Spinner className="size-4" /> : on ? <IconBellOff /> : <IconBell />}
      {on ? 'Turn off notifications' : 'Turn on notifications'}
    </Button>
  );
}
