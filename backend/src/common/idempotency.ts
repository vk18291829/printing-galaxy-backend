import type { Request } from 'express';
import { Schema, model } from 'mongoose';

const KEY = /^[\w-]{8,100}$/;

/**
 * Reads the optional `Idempotency-Key` header (a UUID per user action). Scoped to the caller,
 * so two people can never collide. Undefined when missing or malformed.
 */
export function idempotencyHeader(req: Request) {
  const key = req.headers['idempotency-key'];
  return typeof key === 'string' && KEY.test(key) && req.auth ? `${req.auth.kind}:${req.auth.id}:${key}` : undefined;
}

const claimSchema = new Schema({
  _id: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 7 * 86_400 },
});
const IdempotencyClaimModel = model('IdempotencyClaim', claimSchema);

/** True for the first caller with this key; false for every repeat (kept 7 days). */
export async function claimKey(key: string) {
  try {
    await IdempotencyClaimModel.create({ _id: key });
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

/** Frees a key when the action failed, so the user can try again. */
export async function releaseKey(key: string) {
  await IdempotencyClaimModel.deleteOne({ _id: key });
}
