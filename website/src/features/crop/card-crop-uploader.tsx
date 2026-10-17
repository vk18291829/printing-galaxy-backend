import { IconCrop, IconLock, IconPhotoPlus, IconReplace, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CartFile } from '@/features/cart/cart-store';
import { deleteUpload, uploadFile } from '@/features/uploads/upload-file';
import { getErrorMessage } from '@/lib/api-client';
import { CropEditor, type CropOutput } from './crop-editor';
import { loadCropSource, PdfPasswordError, type CropSource } from './load-source';

type Side = 'front' | 'back';

/** PVC card trim size at print resolution. */
const CARD: CropOutput = { widthMm: 86, heightMm: 54, dpi: 300 };

interface SlotState {
  fileId: string;
  preview: string;
}

/**
 * Identity cards (Aadhaar, PAN, …): the customer crops the front and back to the exact card size
 * in the browser, so the shop receives print-ready 300 DPI images instead of a full A4 page.
 */
export function CardCropUploader({
  productId,
  files,
  onChange,
}: {
  productId: string;
  files: CartFile[];
  onChange: (files: CartFile[]) => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState<Partial<Record<Side, SlotState>>>({});
  const [source, setSource] = useState<CropSource | null>(null);
  const [editing, setEditing] = useState<Side | null>(null);
  const [pendingSide, setPendingSide] = useState<Side>('front');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [password, setPassword] = useState<{ file: File; wrong: boolean; value: string } | null>(null);
  // Uploads finish asynchronously; append to the latest list.
  const filesRef = useRef(files);
  filesRef.current = files;

  // Parent cleared the files (added to cart): forget our slots too.
  useEffect(() => {
    setSlots((s) => {
      const kept = Object.fromEntries(Object.entries(s).filter(([, v]) => files.some((f) => f.id === v.fileId)));
      return Object.keys(kept).length === Object.keys(s).length ? s : kept;
    });
  }, [files]);

  async function open(file: File, side: Side, pwd?: string, page?: number) {
    setLoading(true);
    try {
      const loaded = await loadCropSource(file, { password: pwd, page });
      if (source && source.url !== loaded.url) URL.revokeObjectURL(source.url);
      setSource(loaded);
      setEditing(side);
      setPassword(null);
    } catch (err) {
      if (err instanceof PdfPasswordError) setPassword({ file, wrong: err.wrong, value: pwd ?? '' });
      else toast.error(t('crop.unreadable'));
    } finally {
      setLoading(false);
    }
  }

  function choose(side: Side) {
    setPendingSide(side);
    inputRef.current?.click();
  }

  async function save(blob: Blob) {
    if (!editing) return;
    const side = editing;
    setSaving(true);
    try {
      const file = new File([blob], `card-${side}.jpg`, { type: 'image/jpeg' });
      const uploaded = await uploadFile(file, { productId });
      const previous = slots[side];
      const next = filesRef.current.filter((f) => f.id !== previous?.fileId);
      if (previous) void deleteUpload(previous.fileId).catch(() => undefined);
      onChange([...next, { id: uploaded._id, name: uploaded.originalName, size: uploaded.size }]);
      if (previous) URL.revokeObjectURL(previous.preview);
      setSlots((s) => ({ ...s, [side]: { fileId: uploaded._id, preview: URL.createObjectURL(blob) } }));
      setEditing(null);
      toast.success(t('crop.done'));
    } catch (err) {
      toast.error(`${t('upload.failed')}: ${getErrorMessage(err)}`);
    } finally {
      setSaving(false);
    }
  }

  function remove(side: Side) {
    const slot = slots[side];
    if (!slot) return;
    onChange(files.filter((f) => f.id !== slot.fileId));
    void deleteUpload(slot.fileId).catch(() => undefined);
    URL.revokeObjectURL(slot.preview);
    setSlots((s) => ({ ...s, [side]: undefined }));
  }

  const sideLabel = (side: Side) => t(side === 'front' ? 'crop.front' : 'crop.back');

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t('crop.intro')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {(['front', 'back'] as const).map((side) => {
          const slot = slots[side];
          return (
            <div key={side} className="space-y-2">
              <p className="text-sm font-semibold">{sideLabel(side)}</p>
              {slot ? (
                <div className="group relative">
                  <img src={slot.preview} alt={sideLabel(side)} className="aspect-[86/54] w-full rounded-xl border object-cover shadow-sm" />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {source && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditing(side)}>
                        <IconCrop /> {t('crop.recrop')}
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="outline" onClick={() => choose(side)}>
                      <IconReplace /> {t('crop.replace')}
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="ml-auto size-8" onClick={() => remove(side)} aria-label={t('common.remove')}>
                      <IconX />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex aspect-[86/54] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3 text-center">
                  <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => choose(side)}>
                    {loading && pendingSide === side ? <Spinner className="size-4" /> : <IconPhotoPlus />} {t('crop.choose')}
                  </Button>
                  {source && side === 'back' && slots.front && (
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing('back')}>
                      <IconCrop /> {t('crop.sameFile')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <IconLock className="mt-0.5 size-3.5 shrink-0" /> {t('crop.privacy')}
      </p>

      <input
        ref={inputRef}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void open(file, pendingSide);
        }}
      />

      {editing && source && (
        <CropEditor
          source={source}
          output={CARD}
          title={t('crop.editorTitle', { side: sideLabel(editing) })}
          busy={saving || loading}
          onCancel={() => setEditing(null)}
          onConfirm={(blob) => void save(blob)}
          onPage={(page) => void open(source.file, editing, password?.value || undefined, page)}
        />
      )}

      {password && (
        <Dialog open onOpenChange={(o) => !o && setPassword(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('crop.passwordTitle')}</DialogTitle>
              <DialogDescription>{t('crop.passwordHint')}</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void open(password.file, pendingSide, password.value);
              }}
            >
              <Label htmlFor="pdf-password">{t('crop.password')}</Label>
              <Input
                id="pdf-password"
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
                value={password.value}
                onChange={(e) => setPassword({ ...password, value: e.target.value })}
              />
              {password.wrong && <p className="text-sm text-destructive">{t('crop.passwordWrong')}</p>}
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setPassword(null)}>
                  {t('common.cancel')}
                </Button>
                <Button type="submit" disabled={!password.value || loading}>
                  {loading && <Spinner className="size-4 text-current" />} {t('crop.open')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
