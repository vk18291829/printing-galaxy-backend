import { IconAlertTriangle, IconCloudUpload, IconFileTypePdf, IconPhoto, IconFile, IconLoader2, IconX } from '@tabler/icons-react';
import { useRef, useState, type DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
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
}: {
  productId: string;
  accepted: string[];
  files: CartFile[];
  onChange: (files: CartFile[]) => void;
  disabled?: boolean;
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
    for (const file of Array.from(list)) {
      if (!accepted.includes(fileExtension(file.name))) {
        toast.error(`${file.name}: ${t('upload.typeNotAllowed')}`);
        continue;
      }
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        toast.error(`${file.name}: ${t('upload.tooLarge')}`);
        continue;
      }
      const key = crypto.randomUUID();
      setPending((p) => [...p, { key, name: file.name, size: file.size, progress: 0, stage: 'uploading' }]);
      try {
        const uploaded = await uploadFile(file, {
          productId,
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

  function remove(id: string) {
    onChange(files.filter((f) => f.id !== id));
    void deleteUpload(id).catch(() => undefined);
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/40',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <IconCloudUpload className="size-6" />
        </span>
        <span className="text-sm font-semibold">{t('upload.drop')}</span>
        <span className="text-xs text-muted-foreground">
          {t('upload.accepted', { types: accepted.map((a) => a.toUpperCase()).join(', '), size: MAX_UPLOAD_MB })}
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

      {(files.length > 0 || pending.length > 0) && (
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
              <FileIcon name={f.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.name}</p>
                <p className="text-xs text-muted-foreground">
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
                onClick={() => remove(f.id)}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={t('common.remove')}
              >
                <IconX className="size-4" />
              </button>
            </li>
          ))}
          {pending.map((u) => (
            <li key={u.key} className="space-y-2 rounded-xl border bg-card px-3 py-2.5">
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
    </div>
  );
}
