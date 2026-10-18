import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, isProd } from '@/config/env';
import { logger } from '@/config/logger';

export type BucketKind = 'private' | 'public';

export const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  // Otherwise the SDK signs a CRC32 of an empty body into presigned PUT URLs and every
  // browser upload fails with BadDigest.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
  credentials:
    env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
      : undefined,
});

const bucketName = (kind: BucketKind) =>
  kind === 'public' ? env.S3_PUBLIC_BUCKET : env.S3_PRIVATE_BUCKET;

export function publicUrl(key: string) {
  const base = env.S3_PUBLIC_BASE_URL ?? `https://${env.S3_PUBLIC_BUCKET}.s3.${env.S3_REGION}.amazonaws.com`;
  return `${base.replace(/\/$/, '')}/${key}`;
}

/**
 * Returns the URL plus the headers the browser must send with the PUT. Every header signed into
 * the URL (Content-Type, and the encryption header on the private bucket) has to be sent back
 * exactly, or S3 answers 403 SignatureDoesNotMatch.
 */
export async function presignUpload(kind: BucketKind, key: string, contentType: string, size: number) {
  const encrypt = kind === 'private' && !env.S3_ENDPOINT;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucketName(kind),
      Key: key,
      ContentType: contentType,
      ContentLength: size,
      ...(encrypt ? { ServerSideEncryption: 'AES256' } : {}),
    }),
    { expiresIn: 15 * 60 },
  );
  const headers: Record<string, string> = { 'Content-Type': contentType };
  if (encrypt) headers['x-amz-server-side-encryption'] = 'AES256';
  return { url, headers };
}

export function presignDownload(kind: BucketKind, key: string, fileName: string, expiresIn = 300) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucketName(kind),
      Key: key,
      ResponseContentDisposition: `inline; filename="${fileName.replace(/[^\w.\- ]/g, '_')}"`,
    }),
    { expiresIn },
  );
}

export async function headObject(kind: BucketKind, key: string) {
  try {
    return await s3.send(new HeadObjectCommand({ Bucket: bucketName(kind), Key: key }));
  } catch {
    return null;
  }
}

export async function readObject(kind: BucketKind, key: string) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucketName(kind), Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  return bytes ? Buffer.from(bytes) : null;
}

/** Server-side upload for files the API produces itself (generated print sheets). */
export async function putObject(kind: BucketKind, key: string, body: Uint8Array, contentType: string) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucketName(kind),
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(kind === 'private' && !env.S3_ENDPOINT ? { ServerSideEncryption: 'AES256' } : {}),
    }),
  );
}

export async function deleteObject(kind: BucketKind, key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: bucketName(kind), Key: key }));
}

/**
 * Local S3-compatible storage only: creates the buckets and allows browser uploads from the
 * frontends. On AWS, create buckets and CORS rules in infrastructure instead (see README).
 */
export async function ensureDevBuckets() {
  if (!env.S3_ENDPOINT || isProd) return;
  for (const kind of ['private', 'public'] as const) {
    const Bucket = bucketName(kind);
    try {
      await s3.send(new HeadBucketCommand({ Bucket }));
    } catch {
      try {
        await s3.send(new CreateBucketCommand({ Bucket }));
        logger.info({ Bucket }, 'Created storage bucket');
      } catch (err) {
        logger.warn({ err, Bucket }, 'Storage not reachable — uploads will fail until it is running');
        return;
      }
    }
    await s3
      .send(
        new PutBucketCorsCommand({
          Bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: env.CORS_ORIGINS,
                AllowedMethods: ['GET', 'PUT', 'HEAD'],
                AllowedHeaders: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      )
      .catch(() => undefined);
  }
}
