import { IconMinus, IconPlus, IconRefresh, IconRotateClockwise } from '@tabler/icons-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { loadImage, type CropSource } from './load-source';

/** Output size: the card at 300 DPI. */
export interface CropOutput {
  widthMm: number;
  heightMm: number;
  dpi: number;
}

const MAX_ZOOM = 12;

interface View {
  zoom: number;
  rotation: 0 | 90 | 180 | 270;
  /** Image centre offset from the frame centre, in frame widths. */
  x: number;
  y: number;
}

const INITIAL: View = { zoom: 1, rotation: 0, x: 0, y: 0 };

/**
 * Positions an image inside a fixed-aspect frame (pan, pinch/wheel/slider zoom, 90° turns) and
 * renders exactly what is inside the frame. All geometry is in "frame widths" so the result does
 * not depend on the screen size.
 */
export function CropEditor({
  source,
  output,
  title,
  busy,
  onCancel,
  onConfirm,
  onPage,
}: {
  source: CropSource;
  output: CropOutput;
  title: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
  onPage?: (page: number) => void;
}) {
  const { t } = useTranslation();
  const aspect = output.heightMm / output.widthMm;
  // Callback ref: the dialog mounts its content after the first effects run.
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const [frameW, setFrameW] = useState(0);
  const [view, setView] = useState<View>(INITIAL);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);

  useEffect(() => setView(INITIAL), [source.url]);

  useEffect(() => {
    if (!frameEl) return;
    const ro = new ResizeObserver(([entry]) => setFrameW(entry!.contentRect.width));
    ro.observe(frameEl);
    return () => ro.disconnect();
  }, [frameEl]);

  const turned = view.rotation % 180 !== 0;
  const rw = turned ? source.height : source.width;
  const rh = turned ? source.width : source.height;
  // Scale (frame widths per image pixel) at which the image just covers the frame.
  const cover = Math.max(1 / rw, aspect / rh);

  const clamp = (v: View): View => {
    const s = cover * v.zoom;
    const maxX = Math.max(0, (rw * s - 1) / 2);
    const maxY = Math.max(0, (rh * s - aspect) / 2);
    return { ...v, x: Math.min(maxX, Math.max(-maxX, v.x)), y: Math.min(maxY, Math.max(-maxY, v.y)) };
  };
  const update = (patch: Partial<View>) => setView((v) => clamp({ ...v, ...patch }));

  const onPointerDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: view.zoom };
    }
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !frameW) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const ratio = Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.dist;
      update({ zoom: Math.min(MAX_ZOOM, Math.max(1, pinch.current.zoom * ratio)) });
      return;
    }
    // Two-finger gestures move both pointers; only pan with one.
    if (pointers.current.size === 1) {
      setView((v) => clamp({ ...v, x: v.x + (e.clientX - prev.x) / frameW, y: v.y + (e.clientY - prev.y) / frameW }));
    }
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const onWheel = (e: WheelEvent) => {
    update({ zoom: Math.min(MAX_ZOOM, Math.max(1, view.zoom * Math.exp(-e.deltaY * 0.0015))) });
  };

  const render = async () => {
    const W = Math.round((output.widthMm / 25.4) * output.dpi);
    const H = Math.round((output.heightMm / 25.4) * output.dpi);
    const img = await loadImage(source.url);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';
    const s = cover * view.zoom * W; // output pixels per image pixel
    ctx.translate(W / 2 + view.x * W, H / 2 + view.y * W);
    ctx.rotate((view.rotation * Math.PI) / 180);
    ctx.drawImage(img, (-source.width * s) / 2, (-source.height * s) / 2, source.width * s, source.height * s);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (blob) onConfirm(blob);
  };

  const s = cover * view.zoom * frameW;

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('crop.editorHint')}</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-size-[16px_16px] p-3 sm:p-6">
          <div
            ref={setFrameEl}
            className="relative mx-auto w-full touch-none overflow-hidden rounded-[3.5%/5.6%] bg-white shadow-lg ring-2 ring-primary select-none"
            style={{ aspectRatio: `${output.widthMm} / ${output.heightMm}`, cursor: 'grab' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {frameW > 0 && (
              <img
                src={source.url}
                alt=""
                draggable={false}
                className="pointer-events-none absolute top-1/2 left-1/2 max-w-none"
                style={{
                  width: source.width * s,
                  height: source.height * s,
                  transform: `translate(-50%, -50%) translate(${view.x * frameW}px, ${view.y * frameW}px) rotate(${view.rotation}deg)`,
                }}
              />
            )}
            {/* Thirds guide */}
            <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
              {Array.from({ length: 9 }, (_, i) => (
                <span key={i} className="border-[0.5px] border-white/40" />
              ))}
            </div>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {output.widthMm / 10} × {output.heightMm / 10} cm
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-48 flex-1 items-center gap-2">
            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => update({ zoom: Math.max(1, view.zoom / 1.2) })} aria-label={t('crop.zoom')}>
              <IconMinus />
            </Button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              // Logarithmic slider: equal steps feel the same at every zoom level.
              value={Math.log(view.zoom) / Math.log(MAX_ZOOM)}
              onChange={(e) => update({ zoom: MAX_ZOOM ** Number(e.target.value) })}
              className="h-2 flex-1 accent-primary"
              aria-label={t('crop.zoom')}
            />
            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => update({ zoom: Math.min(MAX_ZOOM, view.zoom * 1.2) })} aria-label={t('crop.zoom')}>
              <IconPlus />
            </Button>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => update({ rotation: ((view.rotation + 90) % 360) as View['rotation'], x: 0, y: 0 })}>
            <IconRotateClockwise /> {t('crop.rotate')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setView(INITIAL)}>
            <IconRefresh /> {t('crop.reset')}
          </Button>
        </div>

        {source.pages && source.pages > 1 && onPage && (
          <div className="flex items-center justify-center gap-2 text-sm">
            <Button type="button" variant="outline" size="sm" disabled={busy || source.page === 1} onClick={() => onPage((source.page ?? 1) - 1)}>
              ‹
            </Button>
            {t('crop.page', { n: source.page, total: source.pages })}
            <Button type="button" variant="outline" size="sm" disabled={busy || source.page === source.pages} onClick={() => onPage((source.page ?? 1) + 1)}>
              ›
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="button" variant="brand" onClick={() => void render()} disabled={busy || !frameW}>
            {busy && <Spinner className="size-4 text-current" />} {busy ? t('crop.saving') : t('crop.use')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
