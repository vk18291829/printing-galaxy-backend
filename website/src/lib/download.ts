import { api } from './api-client';

function fileNameFrom(disposition: string | undefined, fallback: string) {
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? fallback;
}

/**
 * Fetches an authenticated file (invoice, sample sheet) and opens or saves it. A plain link
 * cannot send the bearer token, so the file comes through axios as a blob.
 */
export async function fetchFile(url: string, opts: { fallbackName: string; mode: 'open' | 'save' }) {
  // Open the tab synchronously so pop-up blockers allow it, then point it at the blob.
  const tab = opts.mode === 'open' ? window.open('', '_blank') : null;
  try {
    const res = await api.get<Blob>(url, { responseType: 'blob' });
    const href = URL.createObjectURL(res.data);
    if (tab) {
      tab.location.href = href;
    } else {
      const a = document.createElement('a');
      a.href = href;
      a.download = fileNameFrom(res.headers['content-disposition'] as string | undefined, opts.fallbackName);
      document.body.append(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  } catch (error) {
    tab?.close();
    // Error bodies arrive as blobs too; surface the API message.
    const data = (error as { response?: { data?: Blob } }).response?.data;
    let message: string | undefined;
    if (data instanceof Blob) {
      try {
        message = (JSON.parse(await data.text()) as { error?: { message?: string } }).error?.message;
      } catch {
        // Not a JSON error body.
      }
    }
    throw message ? new Error(message) : error;
  }
}
