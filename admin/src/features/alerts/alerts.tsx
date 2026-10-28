import {
  IconBell,
  IconBuildingCommunity,
  IconCash,
  IconChecks,
  IconCircleX,
  IconFileText,
  IconPalette,
  IconReceipt,
  IconStar,
  IconVolume,
  IconVolumeOff,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

type AlertKind = 'order' | 'quote' | 'proof' | 'payment' | 'cancel' | 'institution' | 'review' | 'files';
interface StaffAlert {
  _id: string;
  kind: AlertKind;
  title: string;
  body: string;
  path: string;
  createdAt: string;
  read: boolean;
}

const KIND: Record<AlertKind, { icon: typeof IconBell; tint: string }> = {
  order: { icon: IconReceipt, tint: 'bg-primary/10 text-primary' },
  quote: { icon: IconFileText, tint: 'bg-brand-amber/15 text-amber-700' },
  proof: { icon: IconPalette, tint: 'bg-brand-magenta/10 text-brand-magenta' },
  payment: { icon: IconCash, tint: 'bg-success/10 text-success' },
  cancel: { icon: IconCircleX, tint: 'bg-destructive/10 text-destructive' },
  institution: { icon: IconBuildingCommunity, tint: 'bg-brand-cyan/10 text-sky-700' },
  review: { icon: IconStar, tint: 'bg-brand-amber/15 text-amber-700' },
  files: { icon: IconFileText, tint: 'bg-primary/10 text-primary' },
};

const SOUND_KEY = 'pga-alert-sound';

export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: async () => (await api.get<{ unread: number; items: StaffAlert[] }>('/admin/alerts')).data,
    // New orders should show up within seconds while the app is open.
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
  });
}

function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api.post('/admin/alerts/read', { ids }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['alerts'] }),
  });
}

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ── Sound ────────────────────────────────────────────────────────────────────

let audio: AudioContext | null = null;
/** Browsers only allow sound after the user has touched the page once; unlock on the first tap. */
function unlockAudio() {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return;
  audio ??= new Ctx();
  if (audio.state === 'suspended') void audio.resume();
}

/** A short two-note chime, made in the browser (no sound file to download). */
function playChime() {
  if (!audio || audio.state !== 'running') return;
  const now = audio.currentTime;
  [
    [880, 0],
    [1320, 0.14],
  ].forEach(([freq, at]) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq!;
    gain.gain.setValueAtTime(0.0001, now + at!);
    gain.gain.exponentialRampToValueAtTime(0.25, now + at! + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at! + 0.45);
    osc.connect(gain).connect(audio!.destination);
    osc.start(now + at!);
    osc.stop(now + at! + 0.5);
  });
}

function readSoundSetting() {
  try {
    return localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

/**
 * Watches for new alerts while the app is open: chime (unless muted), a toast that opens the order,
 * and the unread count on the installed app's icon.
 */
export function AlertWatcher() {
  const { data } = useAlerts();
  const navigate = useNavigate();
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (data.unread > 0) void nav.setAppBadge?.(data.unread).catch(() => undefined);
    else void nav.clearAppBadge?.().catch(() => undefined);

    // The first load only remembers what is already there; later loads announce what is new.
    if (!seen.current) {
      seen.current = new Set(data.items.map((a) => a._id));
      return;
    }
    const fresh = data.items.filter((a) => !seen.current!.has(a._id) && !a.read);
    data.items.forEach((a) => seen.current!.add(a._id));
    if (fresh.length === 0) return;
    if (readSoundSetting()) playChime();
    const latest = fresh[0]!;
    toast(latest.title, {
      description: fresh.length > 1 ? `${latest.body} · and ${fresh.length - 1} more` : latest.body,
      action: { label: 'Open', onClick: () => navigate(latest.path) },
      duration: 8000,
    });
  }, [data, navigate]);

  return null;
}

// ── Bell + list ──────────────────────────────────────────────────────────────

export function AlertsBell() {
  const { data, isLoading } = useAlerts();
  const markRead = useMarkRead();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [sound, setSound] = useState(readSoundSetting);
  const unread = data?.unread ?? 0;

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
    } catch {
      // Not saved in private mode; the choice still holds until reload.
    }
    if (next) {
      unlockAudio();
      playChime();
    }
  };

  const openAlert = (a: StaffAlert) => {
    if (!a.read) markRead.mutate([a._id]);
    setOpen(false);
    navigate(a.path);
  };

  return (
    <>
      <Button variant="ghost" size="icon-sm" className="relative" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} onClick={() => setOpen(true)}>
        <IconBell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] leading-none font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <div className="flex items-center gap-2 border-b px-4 py-3 pr-12">
            <SheetTitle className="flex-1 text-base">
              Notifications {unread > 0 && <span className="ml-1 text-sm font-normal text-muted-foreground">· {unread} new</span>}
            </SheetTitle>
            <Button variant="ghost" size="icon-sm" onClick={toggleSound} aria-label={sound ? 'Mute notification sound' : 'Turn notification sound on'} title={sound ? 'Sound on' : 'Sound off'}>
              {sound ? <IconVolume /> : <IconVolumeOff className="text-muted-foreground" />}
            </Button>
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={() => markRead.mutate(undefined)} disabled={markRead.isPending}>
                <IconChecks /> Mark all read
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="grid place-items-center py-16">
                <Spinner />
              </div>
            ) : !data?.items.length ? (
              <EmptyState icon={<IconBell />} title="No notifications yet" description="New orders, quote replies, proof approvals, payments and registrations show up here." />
            ) : (
              <ul>
                {data.items.map((a) => {
                  const { icon: Icon, tint } = KIND[a.kind] ?? KIND.order;
                  return (
                    <li key={a._id}>
                      <button
                        type="button"
                        onClick={() => openAlert(a)}
                        className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted', !a.read && 'bg-secondary/60')}
                      >
                        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tint)}>
                          <Icon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start gap-2">
                            <span className={cn('flex-1 text-sm', a.read ? 'font-medium' : 'font-semibold')}>{a.title}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.createdAt)}</span>
                          </span>
                          {a.body && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{a.body}</span>}
                        </span>
                        {!a.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
