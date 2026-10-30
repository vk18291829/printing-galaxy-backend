import { IconAlertTriangle, IconCheck, IconCloudUpload, IconFile, IconFileTypePdf, IconLoader2, IconPhoto, IconX } from '@tabler/icons-react';
import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Progress } from '@/components/ui/progress';
import { getErrorMessage } from '@/lib/api-client';
import { formatFileSize } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CartFile } from '@/features/cart/cart-store';
import { acceptAttribute, deleteUpload, fileExtension, MAX_UPLOAD_MB, uploadFile } from './upload-file';

interface PendingUpload {
  key: string;
  name: string;
  size: number;
  progress: number;
  stage: 'uploading' | 'processing';
}

function FileIcon({ name }: { name: string }) {
  const ext = fileExtension(name);
  if (ext === 'pdf') return <IconFileTypePdf className="size-5 text-red-500" />;
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return <IconPhoto className="size-5 text-brand-cyan" />;
  return <IconFile className="size-5 text-muted-foreground" />;
}

export function FileUploader({
  productId,
  accepted,
  files,
  onChange,
  disabled,
  max,
  purpose,
  deferDelete,
}: {
  productId: string;
  accepted: string[];
  files: CartFile[];
  onChange: (files: CartFile[]) => void;
  disabled?: boolean;
  /** Most files allowed in total; extra picks are skipped with a message. */
  max?: number;
  /** `bulk` for class lists and photos: private and deleted after the retention period. */
  purpose?: 'order' | 'bulk';
  /** Removing only takes the file off the list; the caller deletes it once the change is saved. */
  deferDelete?: boolean;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [unreadable, setUnreadable] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  // Uploads finish asynchronously; keep the latest list to append to.
  const filesRef = useRef(files);
  filesRef.current = files;

  async function handleFiles(list: FileList | null) {
    if (!list || disabled) return;
    let room = max ? max - filesRef.current.length - pending.length : Infinity;
    for (const file of Array.from(list)) {
      if (room <= 0) {
        toast.error(t('upload.maxFiles', { count: max }));
        break;
      }
      if (!accepted.includes(fileExtension(file.name))) {
        toast.error(`${file.name}: ${t('upload.typeNotAllowed')}`);
        continue;
      }
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        toast.error(`${file.name}: ${t('upload.tooLarge')}`);
        continue;
      }
      room -= 1;
      const key = crypto.randomUUID();
      setPending((p) => [...p, { key, name: file.name, size: file.size, progress: 0, stage: 'uploading' }]);
      try {
        const uploaded = await uploadFile(file, {
          productId,
          purpose,
          onProgress: (progress) =>
            setPending((p) =>
              p.map((u) => (u.key === key ? { ...u, progress, stage: progress >= 100 ? 'processing' : 'uploading' } : u)),
            ),
        });
        if (uploaded.readable === false) setUnreadable((u) => [...u, uploaded._id]);
        onChange([
          ...filesRef.current,
          { id: uploaded._id, name: uploaded.originalName, size: uploaded.size, pageCount: uploaded.pageCount },
        ]);
      } catch (error) {
        toast.error(`${t('upload.failed')}: ${getErrorMessage(error)}`);
      } finally {
        setPending((p) => p.filter((u) => u.key !== key));
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  async function remove(file: CartFile) {
    const ok = await confirmAction({
      tone: 'danger',
      title: t('confirm.removeFileTitle'),
      description: t('confirm.removeFileDesc', { name: file.name }),
      confirmLabel: t('common.remove'),
    });
    if (!ok) return;
    onChange(files.filter((f) => f.id !== file.id));
    if (!deferDelete) void deleteUpload(file.id).catch(() => undefined);
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handleFiles(e.dataTransfer.files);
  };

  const full = Boolean(max && files.length + pending.length >= max);

  return (
    <div className="space-y-3">
      {(files.length > 0 || pending.length > 0) && (
        <ul className="space-y-2">
          {files.map((f) => (
            // Uploaded: a green card with a tick, so it is clear the file is in.
            <li
              key={f.id}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2.5',
                unreadable.includes(f.id) ? 'border-destructive/40 bg-destructive/5' : 'border-success/35 bg-success/6',
              )}
            >
              <span className="relative grid size-10 shrink-0 place-items-center rounded-lg bg-card ring-1 ring-border">
                <FileIcon name={f.name} />
                {!unreadable.includes(f.id) && (
                  <span className="absolute -right-1.5 -bottom-1.5 grid size-5 place-items-center rounded-full bg-success text-white ring-2 ring-card">
                    <IconCheck className="size-3" stroke={3.5} />
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{f.name}</p>
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {!unreadable.includes(f.id) && <span className="font-semibold text-success">{t('upload.uploaded')}</span>}
                  {!unreadable.includes(f.id) && <span aria-hidden>·</span>}
                  {formatFileSize(f.size)}
                  {f.pageCount ? ` · ${t('upload.pages', { count: f.pageCount })}` : ''}
                </p>
                {unreadable.includes(f.id) && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <IconAlertTriangle className="size-3.5" /> {t('upload.unreadable')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => void remove(f)}
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={t('common.remove')}
              >
                <IconX className="size-4" />
              </button>
            </li>
          ))}
          {pending.map((u) => (
            <li key={u.key} className="space-y-2 rounded-xl border border-primary/25 bg-secondary/60 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <IconLoader2 className="size-5 animate-spin text-primary" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium">{u.name}</p>
                <span className="text-xs text-muted-foreground">
                  {u.stage === 'processing' ? t('upload.processing') : `${u.progress}%`}
                </span>
              </div>
              <Progress value={u.progress} />
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={disabled || full}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex w-full items-center rounded-2xl border-2 border-dashed px-4 text-center transition-colors',
          files.length + pending.length > 0 ? 'flex-row justify-center gap-3 py-3.5' : 'flex-col gap-2 py-7',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/40',
          (disabled || full) && 'pointer-events-none opacity-50',
        )}
      >
        <span className={cn('grid shrink-0 place-items-center rounded-full bg-primary/10 text-primary', files.length + pending.length > 0 ? 'size-9' : 'size-12')}>
          <IconCloudUpload className={files.length + pending.length > 0 ? 'size-5' : 'size-6'} />
        </span>
        <span className="text-sm font-semibold">{files.length + pending.length > 0 ? t('upload.addAnother') : t('upload.drop')}</span>
        <span className={cn('text-xs text-muted-foreground', files.length + pending.length > 0 && 'max-sm:hidden')}>
          {t('upload.accepted', { types: accepted.map((a) => a.toUpperCase()).join(', '), size: MAX_UPLOAD_MB })}
          {max ? ` · ${t('upload.maxShort', { count: max, done: files.length })}` : ''}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={acceptAttribute(accepted)}
        onChange={(e) => void handleFiles(e.target.files)}
      />

    </div>
  );
}
