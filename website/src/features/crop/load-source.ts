export interface CropSource {
  url: string;
  width: number;
  height: number;
  /** For PDFs: which page this is and how many there are. */
  page?: number;
  pages?: number;
  file: File;
}

export class PdfPasswordError extends Error {
  constructor(public readonly wrong: boolean) {
    super(wrong ? 'Incorrect password' : 'Password required');
  }
}

/** Long side of a rendered PDF page. e-Aadhaar cards fill ~40% of the page width, so this keeps them above 300 DPI. */
const PDF_RENDER_WIDTH = 3000;

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image could not be read'));
    img.src = url;
  });
}

async function loadPdf(file: File, page: number, password?: string): Promise<CropSource> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), password }).promise;
  } catch (err) {
    if ((err as { name?: string }).name === 'PasswordException') {
      // code 2 = incorrect password, 1 = password needed
      throw new PdfPasswordError((err as { code?: number }).code === 2);
    }
    throw err;
  }
  const pdfPage = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
  const base = pdfPage.getViewport({ scale: 1 });
  const viewport = pdfPage.getViewport({ scale: PDF_RENDER_WIDTH / Math.max(base.width, base.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Render failed'))), 'image/png'),
  );
  const pages = doc.numPages;
  await doc.destroy();
  return { url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height, page, pages, file };
}

/** Turns a chosen photo or PDF page into an image the crop editor can show. */
export async function loadCropSource(file: File, opts: { page?: number; password?: string } = {}): Promise<CropSource> {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (isPdf) return loadPdf(file, opts.page ?? 1, opts.password);
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return { url, width: img.naturalWidth, height: img.naturalHeight, file };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export { loadImage };
