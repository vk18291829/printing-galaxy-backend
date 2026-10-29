import { IconCloudUpload, IconFile, IconFileTypePdf, IconLoader2, IconPhoto, IconX } from '@tabler/icons-react';
import axios from 'axios';
import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';
import { api, getErrorMessage } from '@/lib/api-client';
import { formatFileSize } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { UploadedFile } from '@/types/api';

/** A customer file uploaded by staff for an order line. */
export interface LineFile {
  id: string;
  name: string;
  size: number;
  /** Pages counted by the server (PDFs). */
  pageCount?: number;
}

const MAX_UPLOAD_MB = 100;

const EXT_TO_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};

const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/**
 * Same three steps as the website: presigned URL, PUT straight to storage, then confirm so the
 * server checks the file and counts PDF pages. The file belongs to the staff member, which is what
 * a walk-in order expects.
 */
async function uploadFile(file: File, productId: string, onProgress: (percent: number) => void) {
  const ext = extensionOf(file.name);
  const mimeType = file.type && Object.values(EXT_TO_MIME).includes(file.type) ? file.type : (EXT_TO_MIME[ext] ?? file.type);
  const { data: presign } = await api.post<{ fileId: string; uploadUrl: string; headers: Record<string, string> }>('/uploads/presign', {
    fileName: file.name,
    mimeType,
    size: file.size,
    purpose: 'order',
    productId,
  });
  await axios.put(presign.uploadUrl, file, {
    headers: presign.headers,
    onUploadProgress: (e) => e.total && onProgress(Math.round((e.loaded / e.total) * 100)),
  });
  return (await api.post<UploadedFile>(`/uploads/${presign.fileId}/complete`)).data;
}

export const deleteUpload = (id: string) => api.delete(`/uploads/${id}`).catch(() => undefined);

function FileIcon({ name }: { name: string }) {
  const ext = extensionOf(name);
  if (ext === 'pdf') return <IconFileTypePdf className="size-5 shrink-0 text-destructive" />;
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return <IconPhoto className="size-5 shrink-0 text-info" />;
  return <IconFile className="size-5 shrink-0 text-muted-foreground" />;
}

interface Pending {
  key: string;
  name: string;
  progress: number;
}

export function FileUploader({
  productId,
  accepted,
  files,
  onChange,
}: {
  productId: string;
  accepted: string[];
  files: LineFile[];
  onChange: (files: LineFile[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  // Uploads finish one by one; always append to the latest list.
  const filesRef = useRef(files);
  filesRef.current = files;

  async function handle(list: FileList | null) {
    if (!list) return;
    for (const file of Array.from(list)) {
      if (!accepted.includes(extensionOf(file.name))) {
        toast.error(`${file.name}: only ${accepted.map((a) => a.toUpperCase()).join(', ')} files`);
        continue;
      }
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        toast.error(`${file.name}: larger than ${MAX_UPLOAD_MB} MB`);
        continue;
      }
      const key = crypto.randomUUID();
      setPending((p) => [...p, { key, name: file.name, progress: 0 }]);
      try {
        const up = await uploadFile(file, productId, (progress) => setPending((p) => p.map((u) => (u.key === key ? { ...u, progress } : u))));
        if (up.readable === false) toast.warning(`${file.name}: pages could not be counted. Enter the page count yourself.`);
        onChange([...filesRef.current, { id: up._id, name: up.originalName, size: up.size, pageCount: up.pageCount }]);
      } catch (err) {
        toast.error(`${file.name}: upload failed. ${getErrorMessage(err)}`);
      } finally {
        setPending((p) => p.filter((u) => u.key !== key));
      }
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void handle(e.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3.5 text-left transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'hover:border-primary/50 hover:bg-accent/40',
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <IconCloudUpload className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Upload or drop the customer's files</span>
          <span className="block text-xs text-muted-foreground">
            {accepted.map((a) => a.toUpperCase()).join(', ')} · up to {MAX_UPLOAD_MB} MB each
          </span>
        </span>
      </button>
      <input ref={inputRef} type="file" multiple hidden accept={accepted.map((a) => `.${a}`).join(',')} onChange={(e) => void handle(e.target.files)} />

      {(files.length > 0 || pending.length > 0) && (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
              <FileIcon name={f.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{f.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatFileSize(f.size)}
                  {f.pageCount ? ` · ${f.pageCount} page${f.pageCount > 1 ? 's' : ''}` : ''}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  onChange(files.filter((x) => x.id !== f.id));
                  void deleteUpload(f.id);
                }}
              >
                <IconX className="size-4" />
              </button>
            </li>
          ))}
          {pending.map((u) => (
            <li key={u.key} className="space-y-1.5 rounded-lg border bg-card px-3 py-2">
              <span className="flex items-center gap-2 text-sm">
                <IconLoader2 className="size-4 animate-spin text-primary" />
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{u.progress >= 100 ? 'Checking…' : `${u.progress}%`}</span>
              </span>
              <Progress value={u.progress} className="h-1" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
