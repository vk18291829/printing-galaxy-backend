import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Response } from 'express';
import type { AuthContext } from '@/common/types';
import { env } from '@/config/env';

export const REFRESH_COOKIE = {
  website: 'pg_rt',
  admin: 'pg_admin_rt',
} as const;
export type RefreshCookieScope = keyof typeof REFRESH_COOKIE;

const COOKIE_PATH = '/api/v1/auth';

export function signAccessToken(ctx: AuthContext) {
  return jwt.sign({ kind: ctx.kind, role: ctx.role }, env.JWT_ACCESS_SECRET, {
    subject: ctx.id,
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AuthContext {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as jwt.JwtPayload;
  return { id: String(payload.sub), kind: payload.kind, role: payload.role };
}

/** Refresh tokens are opaque random strings; only their SHA-256 hash is stored. */
export function createRefreshToken() {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

export function setRefreshCookie(res: Response, scope: RefreshCookieScope, token: string) {
  res.cookie(REFRESH_COOKIE[scope], token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SECURE ? 'none' : 'lax',
    path: COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response, scope: RefreshCookieScope) {
  res.clearCookie(REFRESH_COOKIE[scope], {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SECURE ? 'none' : 'lax',
    path: COOKIE_PATH,
  });
}
