import { IconCamera, IconTrash } from '@tabler/icons-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { useUpdateAccount } from '@/features/auth/api';
import { CropEditor } from '@/features/crop/crop-editor';
import { loadCropSource, type CropSource } from '@/features/crop/load-source';
import { uploadFile } from '@/features/uploads/upload-file';
import { cn } from '@/lib/utils';

/** "Galaxy Public School" → "GP". */
export function initials(name: string) {
  return (
    name
      .replace(/\(.*?\)/g, '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?'
  );
}

/** The profile photo, or the initials on navy when there is none. */
export function UserAvatar({ name, src, className }: { name: string; src?: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-navy font-bold text-white', className)}>
      {src && !broken ? <img src={src} alt="" className="size-full object-cover" onError={() => setBroken(true)} /> : initials(name)}
    </span>
  );
}

/** 512 px square at 300 DPI, in the millimetres the crop editor works in. */
const AVATAR_OUTPUT = { widthMm: (512 / 300) * 25.4, heightMm: (512 / 300) * 25.4, dpi: 300 };
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Change the profile photo: pick an image, fit it in the circle, and it is saved straight away
 * (it does not wait for the rest of the profile form).
 */
export function AvatarPicker({ name, src }: { name: string; src?: string }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const update = useUpdateAccount();
  const [source, setSource] = useState<CropSource | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > MAX_BYTES) {
      toast.error(t('account.photoInvalid'));
      return;
    }
    try {
      setSource(await loadCropSource(file));
    } catch {
      toast.error(t('account.photoInvalid'));
    }
  };

  const close = () => {
    if (source) URL.revokeObjectURL(source.url);
    setSource(null);
  };

  const save = async (blob: Blob) => {
    setBusy(true);
    try {
      const uploaded = await uploadFile(new File([blob], 'profile.jpg', { type: 'image/jpeg' }), { purpose: 'avatar' });
      await update.mutateAsync({ avatarFileId: uploaded._id });
      toast.success(t('account.photoSaved'));
      close();
    } catch {
      toast.error(t('account.photoFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    void confirmAction({
      tone: 'danger',
      title: t('confirm.removePhotoTitle'),
      description: t('confirm.removePhotoDesc'),
      confirmLabel: t('common.remove'),
      action: () => update.mutateAsync({ avatarFileId: null }),
      successTitle: t('account.photoRemoved'),
    });

  return (
    <div className="flex shrink-0 flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative rounded-full focus-visible:ring-4 focus-visible:ring-brand-amber/60 focus-visible:outline-none"
        aria-label={src ? t('account.photoChange') : t('account.photoAdd')}
      >
        <UserAvatar name={name} src={src} className="size-24 text-3xl ring-4 ring-white sm:size-28" />
        <span className="absolute right-0 bottom-0 grid size-9 place-items-center rounded-full border-2 border-white bg-brand-amber text-brand-navy transition-transform group-hover:scale-105">
          {update.isPending && !source ? <Spinner className="size-4 text-current" /> : <IconCamera className="size-4.5" />}
        </span>
      </button>
      <div className="flex flex-wrap justify-center gap-1.5">
        <Button type="button" size="sm" variant="outline" className="bg-card" onClick={() => input.current?.click()}>
          <IconCamera /> {src ? t('account.photoChange') : t('account.photoAdd')}
        </Button>
        {src && (
          <Button type="button" size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={remove} disabled={update.isPending}>
            <IconTrash /> {t('common.remove')}
          </Button>
        )}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void pick(e)} />
      {source && <CropEditor round source={source} output={AVATAR_OUTPUT} title={t('account.photoTitle')} busy={busy} onCancel={close} onConfirm={(b) => void save(b)} />}
    </div>
  );
}
