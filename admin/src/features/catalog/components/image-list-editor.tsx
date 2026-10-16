import { IconChevronLeft, IconChevronRight, IconPhotoPlus, IconStar, IconX } from '@tabler/icons-react';
import axios from 'axios';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { api, getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_MB = 8;

/** Uploads a catalogue image to the public bucket and returns its URL. */
export async function uploadCatalogImage(file: File) {
  const { data: presign } = await api.post<{ fileId: string; uploadUrl: string; headers: Record<string, string> }>('/uploads/presign', {
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    purpose: 'catalog',
  });
  await axios.put(presign.uploadUrl, file, { headers: presign.headers });
  const { data } = await api.post<{ publicUrl?: string }>(`/uploads/${presign.fileId}/complete`);
  if (!data.publicUrl) throw new Error('Upload did not return a public link');
  return data.publicUrl;
}

/**
 * Ordered image list: the first image is the cover shown on cards. Upload, remove and move
 * images left/right; `max` limits how many can be added.
 */
export function ImageListEditor({ value, onChange, max }: { value: string[]; onChange: (urls: string[]) => void; max: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const room = max - value.length - uploading;

  async function add(files: FileList | null) {
    if (!files) return;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > picked.length) toast.error(`Only ${max} image${max > 1 ? 's' : ''} allowed`);
    let next = [...value];
    for (const file of picked) {
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`${file.name}: use JPG, PNG or WEBP`);
        continue;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(`${file.name}: larger than ${MAX_MB} MB`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        next = [...next, await uploadCatalogImage(file)];
        onChange(next);
      } catch (e) {
        toast.error(getErrorMessage(e));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const move = (from: number, to: number) => {
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className={cn('grid gap-2', max > 1 ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-1')}>
        {value.map((url, i) => (
          <div key={url} className={cn('group relative overflow-hidden rounded-lg border bg-muted', max > 1 ? 'aspect-square' : 'aspect-video')}>
            <img src={url} alt="" className="size-full object-cover" />
            {i === 0 && max > 1 && (
              <span className="absolute top-1 left-1 flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-0.5 text-[10px] font-medium">
                <IconStar className="size-3" /> Cover
              </span>
            )}
            <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <div className="flex gap-1">
                {i > 0 && (
                  <Button type="button" size="icon-sm" variant="secondary" className="size-7" aria-label="Move left" onClick={() => move(i, i - 1)}>
                    <IconChevronLeft />
                  </Button>
                )}
                {i < value.length - 1 && (
                  <Button type="button" size="icon-sm" variant="secondary" className="size-7" aria-label="Move right" onClick={() => move(i, i + 1)}>
                    <IconChevronRight />
                  </Button>
                )}
              </div>
              <Button type="button" size="icon-sm" variant="destructive" className="size-7" aria-label="Remove image" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <IconX />
              </Button>
            </div>
          </div>
        ))}
        {Array.from({ length: uploading }, (_, i) => (
          <div key={`up-${i}`} className={cn('grid place-items-center rounded-lg border bg-muted', max > 1 ? 'aspect-square' : 'aspect-video')}>
            <Spinner className="size-5" />
          </div>
        ))}
        {room > 0 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={cn(
              'flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground',
              max > 1 ? 'aspect-square' : 'aspect-video',
            )}
          >
            <IconPhotoPlus className="size-5" />
            Add image
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {max > 1 ? `Up to ${max} images · the first is the cover · ` : ''}JPG, PNG or WEBP up to {MAX_MB} MB
      </p>
      <input
        ref={input}
        type="file"
        hidden
        multiple={max > 1}
        accept={ACCEPTED.join(',')}
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
