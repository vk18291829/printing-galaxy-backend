import { useEffect } from 'react';

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · Printing Galaxy` : 'Printing Galaxy — Print anything, delivered';
  }, [title]);
}
