/** ID card photos are 3:4 portraits; 600 × 800 is plenty for print and keeps uploads small. */
export const PHOTO_SIZE = { width: 600, height: 800 };

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not prepare the photo'))), 'image/jpeg', 0.88),
  );
}

/** Centre-crops any image or video frame to 3:4 and scales it to PHOTO_SIZE. */
export function cropToPortrait(source: CanvasImageSource, width: number, height: number, mirror = false) {
  const target = PHOTO_SIZE.width / PHOTO_SIZE.height;
  let sw = width;
  let sh = height;
  if (width / height > target) sw = height * target;
  else sh = width / target;
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE.width;
  canvas.height = PHOTO_SIZE.height;
  const ctx = canvas.getContext('2d')!;
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, (width - sw) / 2, (height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvasToJpeg(canvas);
}

/** A chosen photo file, turned upright (EXIF), cropped and resized. */
export async function prepareFile(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return await cropToPortrait(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
