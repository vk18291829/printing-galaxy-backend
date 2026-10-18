/** In-memory stand-in for the S3 storage module, so the suite needs no object storage. */
type BucketKind = 'private' | 'public';

export const objects = new Map<string, Buffer>();
const id = (kind: BucketKind, key: string) => `${kind}/${key}`;

export const s3 = {};

export function publicUrl(key: string) {
  return `https://public.test/${key}`;
}

export async function presignUpload(kind: BucketKind, key: string, contentType: string) {
  return { url: `memory://${id(kind, key)}`, headers: { 'Content-Type': contentType } };
}

export async function presignDownload(kind: BucketKind, key: string) {
  return `memory://${id(kind, key)}?download`;
}

export async function headObject(kind: BucketKind, key: string) {
  const obj = objects.get(id(kind, key));
  return obj ? { ContentLength: obj.length } : null;
}

export async function readObject(kind: BucketKind, key: string) {
  return objects.get(id(kind, key)) ?? null;
}

export async function putObject(kind: BucketKind, key: string, body: Uint8Array) {
  objects.set(id(kind, key), Buffer.from(body));
}

export async function deleteObject(kind: BucketKind, key: string) {
  objects.delete(id(kind, key));
}

export async function ensureDevBuckets() {}

/** What the browser does with a presigned URL. */
export function putPresigned(url: string, body: Uint8Array) {
  objects.set(url.replace('memory://', ''), Buffer.from(body));
}
