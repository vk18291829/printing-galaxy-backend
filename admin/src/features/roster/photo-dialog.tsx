import { IconCamera, IconCameraRotate, IconCheck, IconPhotoUp, IconPlayerSkipForward, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Person, useRosterActions } from './api';
import { cropToPortrait, prepareFile } from './photo';

type Facing = 'user' | 'environment';

const CAMERA_ERRORS: Record<string, string> = {
  denied: 'Camera permission was blocked. Allow it in the browser settings, or upload a photo instead.',
  unavailable: 'No camera found. Upload a photo instead.',
  unsupported: "This browser can't open the camera. Upload a photo instead.",
};

function useCamera(active: boolean, facing: Facing) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) return;
    let stream: MediaStream | null = null;
    let cancelled = false;
    setReady(false);
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('unsupported');
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const video = videoRef.current;
        if (video) {
          video.srcObject = s;
          void video.play().then(() => setReady(true));
        }
      })
      .catch((e: DOMException) => setError(e.name === 'NotAllowedError' ? 'denied' : 'unavailable'));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [active, facing]);

  return { videoRef, error, ready };
}

/**
 * Take or upload a person's photo. Opened from one person, it walks on to the next person still
 * missing a photo after each save, so a teacher can photograph a whole class in one go.
 */
export function PhotoDialog({ people, personId, onPersonChange, onClose, save }: {
  people: Person[];
  personId: string | null;
  onPersonChange: (id: string | null) => void;
  onClose: () => void;
  save: ReturnType<typeof useRosterActions>['setPhoto'];
}) {
  const person = people.find((p) => p._id === personId) ?? null;
  const [mode, setMode] = useState<'camera' | 'upload'>('camera');
  const [facing, setFacing] = useState<Facing>('environment');
  const [shot, setShot] = useState<{ blob: Blob; url: string; source: 'camera' | 'upload' } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { videoRef, error, ready } = useCamera(Boolean(person) && mode === 'camera' && !shot, facing);

  const clearShot = useCallback(() => {
    setShot((s) => {
      if (s) URL.revokeObjectURL(s.url);
      return null;
    });
  }, []);
  useEffect(clearShot, [personId, clearShot]);

  if (!person) return null;

  // Next person without a photo, after this one in list order (then from the top).
  const index = people.findIndex((p) => p._id === person._id);
  const next = [...people.slice(index + 1), ...people.slice(0, index)].find((p) => !p.hasPhoto && p._id !== person._id);
  const missing = people.filter((p) => !p.hasPhoto).length;

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const blob = await cropToPortrait(video, video.videoWidth, video.videoHeight, facing === 'user');
    setShot({ blob, url: URL.createObjectURL(blob), source: 'camera' });
  };

  const pick = async (file?: File) => {
    if (!file) return;
    try {
      const blob = await prepareFile(file);
      setShot({ blob, url: URL.createObjectURL(blob), source: 'upload' });
    } catch {
      toast.error("Couldn't read this image. Try a JPG or PNG.");
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = (goNext: boolean) => {
    if (!shot) return;
    save.mutate(
      { person, blob: shot.blob, source: shot.source },
      {
        onSuccess: () => {
          toast.success(`Photo saved for ${person.name} (${person.code})`);
          clearShot();
          if (goNext && next) onPersonChange(next._id);
          else onClose();
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );
  };

  const details = [person.class && `Class ${person.class}${person.section ? `-${person.section}` : ''}`, person.rollNo && `Roll ${person.rollNo}`, person.designation]
    .filter(Boolean)
    .join(' · ');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle >{person.name}</DialogTitle>
          <DialogDescription>
            <span className="font-mono font-semibold text-foreground">{person.code}</span>
            {details && ` · ${details}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-1 rounded-xl border bg-muted/40 p-1" role="tablist">
          {(['camera', 'upload'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                clearShot();
              }}
              className={cn('flex h-9 items-center justify-center gap-2 rounded-lg text-sm font-semibold', mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
            >
              {m === 'camera' ? <IconCamera className="size-4" /> : <IconPhotoUp className="size-4" />}
              {m === 'camera' ? 'Live camera' : 'Upload photo'}
            </button>
          ))}
        </div>

        {/* 3:4 frame, the shape of the printed photo */}
        <div className="relative mx-auto aspect-[3/4] w-full max-w-[300px] overflow-hidden rounded-xl bg-zinc-900">
          {shot ? (
            <img src={shot.url} alt="" className="size-full object-cover" />
          ) : mode === 'camera' ? (
            <>
              <video ref={videoRef} playsInline muted className={cn('size-full object-cover', facing === 'user' && '-scale-x-100')} />
              {error ? (
                <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/85">{CAMERA_ERRORS[error]}</p>
              ) : !ready ? (
                <span className="absolute inset-0 grid place-items-center">
                  <Spinner className="size-6 text-white" />
                </span>
              ) : (
                // Face guide: head inside the oval, shoulders at the bottom.
                <span className="pointer-events-none absolute inset-x-[18%] top-[12%] bottom-[28%] rounded-[50%] border-2 border-dashed border-white/80 shadow-[0_0_0_999px_rgb(0_0_0/0.25)]" />
              )}
            </>
          ) : (
            <button type="button" onClick={() => fileRef.current?.click()} className="grid size-full place-items-center p-6 text-center text-sm text-white/85">
              <span>
                <IconPhotoUp className="mx-auto mb-2 size-8" />
                Choose a photo
              </span>
            </button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void pick(e.target.files?.[0])} />

        {shot ? (
          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={clearShot} disabled={save.isPending}>
                <IconRefresh /> Retake
              </Button>
              <Button variant={next ? 'outline' : 'default'} onClick={() => submit(false)} disabled={save.isPending}>
                {save.isPending ? <Spinner className="size-4 text-current" /> : <IconCheck />} Save photo
              </Button>
            </div>
            {next && (
              <Button variant="default" onClick={() => submit(true)} disabled={save.isPending}>
                <IconPlayerSkipForward /> Save & next: {next.name}
              </Button>
            )}
          </div>
        ) : mode === 'camera' ? (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="outline" size="icon" className="size-11" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))} aria-label="Switch camera">
              <IconCameraRotate />
            </Button>
            <Button variant="default" size="lg" onClick={() => void capture()} disabled={!ready}>
              <IconCamera /> Take photo
            </Button>
          </div>
        ) : (
          <Button variant="default" size="lg" onClick={() => fileRef.current?.click()}>
            <IconPhotoUp /> Choose a photo
          </Button>
        )}

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{missing} photo{missing === 1 ? '' : 's'} missing</span>
          {next && !shot && (
            <button type="button" className="font-semibold text-primary hover:underline" onClick={() => onPersonChange(next._id)}>
              Skip to next
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
