import { useState, type ComponentProps, type ReactNode } from 'react';

/**
 * Image that renders `fallback` instead of the browser's broken-image icon and alt text when
 * the file is missing or the storage server is unreachable.
 */
export function SafeImage({ src, fallback, ...props }: ComponentProps<'img'> & { fallback: ReactNode }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <>{fallback}</>;
  return <img src={src} onError={() => setFailedSrc(src)} {...props} />;
}
