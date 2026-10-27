import { IconExternalLink, IconFileTypePdf, IconMaximize, IconX, IconZoomIn, IconZoomOut } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { UploadedFile } from '@/types/api';

/** A short-lived link to view a private file (proofs live in private storage). */
function useFileUrl(fileId: string) {
  return useQuery({
    queryKey: ['file-url', fileId],
    queryFn: async () => (await api.get<{ url: string }>(`/uploads/${fileId}/url`)).data.url,
    // Links last 5 minutes; refresh before they run out.
    staleTime: 4 * 60_000,
    refetchInterval: 4 * 60_000,
  });
}

/** Full-screen image with zoom steps; pinch-zoom works too (touch-action). Esc or ✕ closes. */
function FullScreenImage({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);
  const btn = 'grid size-11 place-items-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 disabled:opacity-40';
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label={name}>
      <div className="flex items-center justify-end gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" className={btn} onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={zoom <= 1} aria-label="Zoom out">
          <IconZoomOut />
        </button>
        <button type="button" className={btn} onClick={() => setZoom((z) => Math.min(4, z + 0.5))} disabled={zoom >= 4} aria-label="Zoom in">
          <IconZoomIn />
        </button>
        <button type="button" className={btn} onClick={onClose} aria-label="Close">
          <IconX />
        </button>
      </div>
      <div className="flex-1 overflow-auto [touch-action:pinch-zoom_pan-x_pan-y]">
        <img src={url} alt={name} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} className={cn('mx-auto h-auto', zoom === 1 && 'max-h-full w-auto object-contain')} />
      </div>
    </div>
  );
}

/**
 * The proof itself, shown in place: images inline, PDFs in a frame on large screens (phone
 * browsers rarely show PDFs inline, so they get a tap-to-open card). Always with "Open full size".
 */
export function ProofViewer({ file, className }: { file: UploadedFile; className?: string }) {
  const { data: url, isLoading } = useFileUrl(file._id);
  const [full, setFull] = useState(false);
  const isPdf = file.mimeType === 'application/pdf';
  const isImage = file.mimeType?.startsWith('image/');

  return (
    <div className={cn('space-y-2', className)}>
      <div className="overflow-hidden rounded-xl shadow-card bg-muted">
        {isLoading || !url ? (
          <div className="grid h-64 place-items-center">
            <Spinner />
          </div>
        ) : isImage ? (
          <button type="button" onClick={() => setFull(true)} className="group relative block w-full" aria-label={file.originalName}>
            <img src={url} alt={file.originalName} className="mx-auto max-h-[70vh] w-auto object-contain" />
            <span className="absolute right-2 bottom-2 grid size-9 place-items-center rounded-full bg-black/60 text-white">
              <IconMaximize className="size-4" />
            </span>
          </button>
        ) : isPdf ? (
          <>
            <iframe src={`${url}#view=FitH`} title={file.originalName} className="hidden h-[70vh] w-full bg-white md:block" />
            <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-5 md:hidden">
              <IconFileTypePdf className="size-10 shrink-0 text-red-500" />
              <span className="min-w-0">
                <span className="block truncate font-semibold">{file.originalName}</span>
                <span className="text-sm text-primary">Tap to open the proof</span>
              </span>
            </a>
          </>
        ) : (
          <p className="p-5 text-sm">{file.originalName}</p>
        )}
      </div>
      {full && url && <FullScreenImage url={url} name={file.originalName} onClose={() => setFull(false)} />}
      {url && (
        <Button variant="outline" size="sm" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <IconExternalLink /> Open full size
          </a>
        </Button>
      )}
    </div>
  );
}
