import { IconPlayerPlayFilled, IconUpload, IconX } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api-client';
import { parseVideo } from '@/lib/video';
import { uploadCatalogImage } from './image-list-editor';

const MAX_MB = 100;

/** A product's demo video: paste a YouTube/Vimeo link, or upload an MP4/WebM. */
export function VideoEditor({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const video = parseVideo(value);

  async function upload(file?: File) {
    if (!file) return;
    if (!['video/mp4', 'video/webm'].includes(file.type)) return toast.error('Upload an MP4 or WebM video');
    if (file.size > MAX_MB * 1024 * 1024) return toast.error(`Videos must be under ${MAX_MB} MB`);
    setUploading(true);
    try {
      onChange(await uploadCatalogImage(file));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://youtu.be/…  or upload a video" />
        <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={uploading}>
          {uploading ? <Spinner className="size-4" /> : <IconUpload />} Upload
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="icon" onClick={() =>
                void confirmAction({ tone: 'danger', title: 'Remove this video?', description: 'It is taken off the product when you save.', confirmLabel: 'Remove' }).then((ok) => ok && onChange(''))
              } aria-label="Remove video">
            <IconX />
          </Button>
        )}
      </div>
      <input ref={input} type="file" accept="video/mp4,video/webm" hidden onChange={(e) => void upload(e.target.files?.[0])} />
      {value && !video && <p className="text-sm text-destructive">This doesn't look like a video link.</p>}
      {video && (
        <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-lg shadow-card bg-black">
          {video.kind === 'file' ? (
            <video src={video.src} controls className="size-full object-contain" />
          ) : video.thumb ? (
            <>
              <img src={video.thumb} alt="" className="size-full object-cover opacity-80" />
              <span className="absolute inset-0 grid place-items-center text-white">
                <IconPlayerPlayFilled className="size-10" />
              </span>
            </>
          ) : (
            <span className="grid size-full place-items-center text-sm text-white/80">Vimeo video</span>
          )}
        </div>
      )}
    </div>
  );
}
