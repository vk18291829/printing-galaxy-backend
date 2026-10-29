import type { RequestHandler } from 'express';
import { ApiError } from '@/common/errors';
import type { AuthContext, PrincipalKind, UserRole } from '@/common/types';
import { verifyAccessToken } from '@/modules/auth/tokens';
import { permissionsFor, type Permission } from '@/common/permissions';
import { UserModel } from '@/modules/users/user.model';

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

/**
 * Lets the request through when the staff member's job roles grant `permission`. Roles are read
 * fresh from the database, so a change by the owner applies on the next request.
 */
/** Throws unless the signed-in staff member's roles grant the permission (the owner has all). */
export async function assertPermission(auth: AuthContext | undefined, permission: Permission) {
  if (!auth || auth.kind !== 'user') throw ApiError.unauthorized();
  if (auth.role === 'admin') return;
  const user = await UserModel.findById(auth.id).select('role staffRoles isActive').lean();
  if (!user?.isActive || !permissionsFor(user.role, user.staffRoles).includes(permission)) {
    throw ApiError.forbidden("Your role doesn't allow this");
  }
}

export function requirePermission(permission: Permission): RequestHandler {
  return async (req, _res, next) => {
    await assertPermission(req.auth, permission);
    next();
  };
}

export function getAuth(req: { auth?: AuthContext }): AuthContext {
  if (!req.auth) throw ApiError.unauthorized();
  return req.auth;
}
