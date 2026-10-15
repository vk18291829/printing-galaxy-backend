import type { RequestHandler } from 'express';
import { ApiError } from '@/common/errors';
import type { AuthContext, PrincipalKind, UserRole } from '@/common/types';
import { verifyAccessToken } from '@/modules/auth/tokens';

function readToken(header?: string) {
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/** Attaches `req.auth` when a valid token is present, but never rejects. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = readToken(req.headers.authorization);
  if (token) {
    try {
      req.auth = verifyAccessToken(token);
    } catch {
      // Ignore invalid tokens on public routes.
    }
  }
  next();
};

export const authenticate: RequestHandler = (req, _res, next) => {
  const token = readToken(req.headers.authorization);
  if (!token) throw ApiError.unauthorized();
  try {
    req.auth = verifyAccessToken(token);
  } catch {
    throw new ApiError(401, 'Session expired, please sign in again', 'TOKEN_EXPIRED');
  }
  next();
};

export function requireKind(...kinds: PrincipalKind[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw ApiError.unauthorized();
    if (!kinds.includes(req.auth.kind)) throw ApiError.forbidden();
    next();
  };
}

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) throw ApiError.unauthorized();
    if (req.auth.kind !== 'user' || !roles.includes(req.auth.role as UserRole)) {
      throw ApiError.forbidden();
    }
    next();
  };
}

export const requireStaff = requireRole('staff', 'admin');
export const requireAdmin = requireRole('admin');

export function getAuth(req: { auth?: AuthContext }): AuthContext {
  if (!req.auth) throw ApiError.unauthorized();
  return req.auth;
}
