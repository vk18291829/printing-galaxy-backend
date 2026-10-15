import { IconCheck, IconCrop, IconPaperclip, IconPhotoPlus, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CartFile } from '@/features/cart/cart-store';
import { CropEditor } from '@/features/crop/crop-editor';
import { loadCropSource, type CropSource } from '@/features/crop/load-source';
import { uploadFile } from '@/features/uploads/upload-file';
import { getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { DESIGNS, FONTS_TO_LOAD, paint, summarise, THEME_COLORS, type DesignKind, type Images, type Values } from './designs';

export interface AttachedDesign {
  files: CartFile[];
  summary: string;
}

const MAX_PREVIEW_HEIGHT = 440;

function Segmented({ value, options, onChange, label }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              value === o.value ? 'border-primary bg-primary/10 text-primary' : 'hover:border-primary/40',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Type the details, add a photo or logo, see the product update live, then attach the preview
 * (plus the cropped photo / original logo) to the cart item. The shop still sends a proof.
 */
export function DesignStudio({
  kind,
  productId,
  options,
  attached,
  onAttach,
}: {
  kind: DesignKind;
  productId: string;
  /** The product options chosen on the page (size, frame type…), which change the preview. */
  options: Record<string, string>;
  attached: AttachedDesign | null;
  onAttach: (design: AttachedDesign | null) => void;
}) {
  const { t } = useTranslation();
  const spec = DESIGNS[kind];
  const [values, setValues] = useState<Values>(spec.defaults);
  const [images, setImages] = useState<Images>({});
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [source, setSource] = useState<CropSource | null>(null);
  const [cropping, setCropping] = useState(false);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [fontsReady, setFontsReady] = useState(0);
  const [boxW, setBoxW] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  // Canvas text does not wait for web fonts; repaint once they are in.
  useEffect(() => {
    void Promise.all([...FONTS_TO_LOAD.map((f) => document.fonts.load(f)), document.fonts.load(`700 16px 'Noto Sans Devanagari Variable'`, 'अ')])
      .catch(() => undefined)
      .then(() => setFontsReady((n) => n + 1));
  }, []);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setBoxW(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const size = spec.size(values, options);
  const previewScale = boxW ? Math.min(boxW / size.w, MAX_PREVIEW_HEIGHT / size.h) : 0;

  useEffect(() => {
    if (!canvasRef.current || !previewScale) return;
    paint(canvasRef.current, spec, values, images, options, previewScale * (window.devicePixelRatio || 1));
  }, [spec, values, images, options, previewScale, fontsReady]);

  // Any change after attaching makes the attached file stale.
  const fingerprint = useMemo(() => JSON.stringify({ values, options, p: Boolean(photoBlob), l: logoFile?.name }), [values, options, photoBlob, logoFile]);
  const attachedPrint = useRef<string | null>(null);
  useEffect(() => {
    if (attached && attachedPrint.current && attachedPrint.current !== fingerprint) {
      onAttach(null);
      toast.info(t('design.changed'));
    }
  }, [fingerprint, attached, onAttach, t]);

  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function choosePhoto(file: File) {
    setLoadingPhoto(true);
    try {
      const loaded = await loadCropSource(file);
      if (source) URL.revokeObjectURL(source.url);
      setSource(loaded);
      setCropping(true);
    } catch {
      toast.error(t('crop.unreadable'));
    } finally {
      setLoadingPhoto(false);
    }
  }

  async function applyCrop(blob: Blob) {
    const bitmap = await createImageBitmap(blob);
    setImages((i) => ({ ...i, photo: bitmap }));
    setPhotoBlob(blob);
    setCropping(false);
  }

  async function chooseLogo(file: File) {
    try {
      const bitmap = await createImageBitmap(file);
      setImages((i) => ({ ...i, logo: bitmap }));
      setLogoFile(file);
    } catch {
      toast.error(t('crop.unreadable'));
    }
  }

  async function attach() {
    if (spec.photo === 'required' && !photoBlob) {
      toast.error(t('design.needPhoto'));
      return;
    }
    setAttaching(true);
    try {
      const canvas = document.createElement('canvas');
      paint(canvas, spec, values, images, options, spec.dpi / 25.4);
      const preview = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Render failed'))), 'image/png'));
      const uploads: File[] = [new File([preview], `${kind}-design-preview.png`, { type: 'image/png' })];
      if (photoBlob) uploads.push(new File([photoBlob], `${kind}-photo.jpg`, { type: 'image/jpeg' }));
      if (logoFile) uploads.push(logoFile);
      const files: CartFile[] = [];
      for (const file of uploads) {
        const up = await uploadFile(file, { productId });
        files.push({ id: up._id, name: up.originalName, size: up.size });
      }
      attachedPrint.current = fingerprint;
      onAttach({ files, summary: summarise(spec, values, options) });
      toast.success(t('design.attachedToast'));
    } catch (err) {
      toast.error(`${t('upload.failed')}: ${getErrorMessage(err)}`);
    } finally {
      setAttaching(false);
    }
  }

  const photoBox = spec.photoBox?.(values, options);
  const pickFile = (handler: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) handler(f);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        {spec.photo === 'required' && (
          <div className="space-y-1.5">
            <Label>{t('design.photo')}</Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={loadingPhoto} onClick={() => photoInput.current?.click()}>
                {loadingPhoto ? <Spinner className="size-4" /> : <IconPhotoPlus />} {photoBlob ? t('design.changePhoto') : t('design.choosePhoto')}
              </Button>
              {source && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setCropping(true)}>
                  <IconCrop /> {t('design.adjustPhoto')}
                </Button>
              )}
            </div>
            <input ref={photoInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={pickFile((f) => void choosePhoto(f))} />
          </div>
        )}
        {spec.logo && (
          <div className="space-y-1.5">
            <Label>{t('design.logo')}</Label>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => logoInput.current?.click()}>
                <IconPhotoPlus /> {logoFile ? logoFile.name.slice(0, 22) : t('design.chooseLogo')}
              </Button>
              {logoFile && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={t('common.remove')}
                  onClick={() => {
                    setLogoFile(null);
                    setImages((i) => ({ ...i, logo: undefined }));
                  }}
                >
                  <IconX />
                </Button>
              )}
            </div>
            <input ref={logoInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={pickFile((f) => void chooseLogo(f))} />
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {spec.fields.map((f) => (
            <div key={f.key} className={cn('space-y-1.5', ['address', 'school', 'company'].includes(f.key) && 'sm:col-span-2')}>
              <Label htmlFor={`d-${f.key}`}>{t(`design.fields.${f.key}`)}</Label>
              <Input id={`d-${f.key}`} value={values[f.key] ?? ''} maxLength={f.max} inputMode={f.inputMode} onChange={(e) => set(f.key, e.target.value)} />
            </div>
          ))}
        </div>

        {spec.layouts && (
          <Segmented label={t('design.layout')} value={values.layout ?? ''} onChange={(v) => set('layout', v)} options={spec.layouts.map((l) => ({ value: l, label: t(`design.layouts.${l}`) }))} />
        )}
        {spec.shapes && (
          <Segmented label={t('design.shape')} value={values.shape ?? ''} onChange={(v) => set('shape', v)} options={spec.shapes.map((s) => ({ value: s, label: t(`design.shapes.${s}`) }))} />
        )}
        {spec.orientation && (
          <Segmented
            label={t('design.orientation')}
            value={values.orientation ?? 'portrait'}
            onChange={(v) => set('orientation', v)}
            options={[
              { value: 'portrait', label: t('design.portrait') },
              { value: 'landscape', label: t('design.landscape') },
            ]}
          />
        )}
        {spec.colors && (
          <div className="space-y-1.5">
            <Label>{t('design.colour')}</Label>
            <div className="flex gap-2">
              {THEME_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => set('color', c)}
                  className={cn('size-8 rounded-full ring-offset-2 ring-offset-background transition', values.color === c ? 'ring-2 ring-primary' : 'hover:scale-110')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <p className="text-sm font-semibold">{t('design.preview')}</p>
        <div ref={boxRef} className="grid min-h-40 place-items-center rounded-2xl bg-linear-to-br from-muted to-muted/40 p-4">
          <canvas
            ref={canvasRef}
            className="drop-shadow-xl"
            style={previewScale ? { width: size.w * previewScale, height: size.h * previewScale } : undefined}
            aria-label={t('design.preview')}
          />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {Math.round(size.w) / 10} × {Math.round(size.h) / 10} cm · {t('design.proofNote')}
        </p>
        {attached ? (
          <p className="flex items-center justify-center gap-2 rounded-xl bg-success/10 px-3 py-2 text-sm font-medium text-success">
            <IconCheck className="size-4" /> {t('design.attached')}
          </p>
        ) : (
          <Button type="button" variant="brand" className="w-full" disabled={attaching} onClick={() => void attach()}>
            {attaching ? <Spinner className="size-4 text-current" /> : <IconPaperclip />} {attaching ? t('design.attaching') : t('design.attach')}
          </Button>
        )}
      </div>

      {cropping && source && photoBox && (
        <CropEditor
          source={source}
          output={{ widthMm: photoBox.w, heightMm: photoBox.h, dpi: kind === 'frame' ? 200 : 300 }}
          title={t('design.adjustPhoto')}
          onCancel={() => setCropping(false)}
          onConfirm={(blob) => void applyCrop(blob)}
        />
      )}
    </div>
  );
}
