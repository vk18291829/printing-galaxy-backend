import { IconExternalLink, IconFileTypePdf } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
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

/**
 * The proof itself, shown in place: images inline, PDFs in a frame on large screens (phone
 * browsers rarely show PDFs inline, so they get a tap-to-open card). Always with "Open full size".
 */
export function ProofViewer({ file, className }: { file: UploadedFile; className?: string }) {
  const { data: url, isLoading } = useFileUrl(file._id);
  const isPdf = file.mimeType === 'application/pdf';
  const isImage = file.mimeType?.startsWith('image/');

  return (
    <div className={cn('space-y-2', className)}>
      <div className="overflow-hidden rounded-xl border bg-muted">
        {isLoading || !url ? (
          <div className="grid h-64 place-items-center">
            <Spinner />
          </div>
        ) : isImage ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="block">
            <img src={url} alt={file.originalName} className="mx-auto max-h-[70vh] w-auto object-contain" />
          </a>
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
