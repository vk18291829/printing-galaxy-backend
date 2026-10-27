import axios from 'axios';
import { api } from '@/lib/api-client';
import type { UploadedFile } from '@/types/api';

export const MAX_UPLOAD_MB = 100;

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

export function fileExtension(name: string) {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

/** Browsers sometimes report an empty or generic MIME type; fall back to the extension. */
export function resolveMime(file: File) {
  const byExt = EXT_TO_MIME[fileExtension(file.name)];
  if (file.type && Object.values(EXT_TO_MIME).includes(file.type)) return file.type;
  return byExt ?? file.type;
}

export function acceptAttribute(types: string[]) {
  return types.map((t) => `.${t}`).join(',');
}

interface PresignResponse {
  fileId: string;
  uploadUrl: string;
  headers: Record<string, string>;
}

/**
 * Three-step upload: ask the API for a presigned URL, PUT the file straight to S3,
 * then confirm so the server can verify it and count PDF pages.
 */
export async function uploadFile(
  file: File,
  opts: { productId?: string; purpose?: 'order' | 'logo' | 'bulk' | 'roster'; onProgress?: (percent: number) => void } = {},
) {
  const mimeType = resolveMime(file);
  const { data: presign } = await api.post<PresignResponse>('/uploads/presign', {
    fileName: file.name,
    mimeType,
    size: file.size,
    purpose: opts.purpose ?? 'order',
    productId: opts.productId,
  });

  await axios.put(presign.uploadUrl, file, {
    headers: presign.headers,
    onUploadProgress: (e) => {
      if (e.total) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    },
  });

  const { data } = await api.post<UploadedFile>(`/uploads/${presign.fileId}/complete`);
  return data;
}

export function deleteUpload(fileId: string) {
  return api.delete(`/uploads/${fileId}`);
}

export async function openFile(fileId: string) {
  const { data } = await api.get<{ url: string }>(`/uploads/${fileId}/url`);
  window.open(data.url, '_blank', 'noopener');
}
