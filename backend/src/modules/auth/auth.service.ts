import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { ApiError } from '@/common/errors';
import { STAFF_ROLES, type AuthContext, type UserRole } from '@/common/types';
import { env, isProd } from '@/config/env';
import { logEvent, maskPhone } from '@/config/logger';
import { audit } from '@/modules/audit/audit.model';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { notifications } from '@/modules/notifications/notification.service';
import { UserModel } from '@/modules/users/user.model';
import type { z } from 'zod';
import { OtpModel } from './otp.model';
import { SessionModel } from './session.model';
import type { institutionRegisterSchema } from './auth.schema';
import {
  clearRefreshCookie,
  createRefreshToken,
  hashToken,
  REFRESH_COOKIE,
  setRefreshCookie,
  signAccessToken,
  type RefreshCookieScope,
} from './tokens';

const OTP_RESEND_COOLDOWN_MS = 30_000;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_ATTEMPTS = 5;

/** Two tabs refreshing at the same moment both succeed inside this window. */
const ROTATION_GRACE_MS = 30_000;

export type OtpPurpose = 'login' | 'password_reset' | 'track';

const hashOtp = (phone: string, code: string, purpose: OtpPurpose = 'login') =>
  crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(purpose === 'login' ? `${phone}:${code}` : `${purpose}:${phone}:${code}`).digest('hex');

export const hashPassword = (plain: string) => bcrypt.hash(plain, 12);

// ── Sessions ────────────────────────────────────────────────────────────────

async function issueSession(req: Request, res: Response, scope: RefreshCookieScope, ctx: AuthContext, family?: Types.ObjectId) {
  const { token, hash } = createRefreshToken();
  await SessionModel.create({
    subject: ctx.id,
    kind: ctx.kind,
    tokenHash: hash,
    family: family ?? new Types.ObjectId(),
    userAgent: req.headers['user-agent']?.slice(0, 300),
    ip: req.ip,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
  });
  setRefreshCookie(res, scope, token);
  return signAccessToken(ctx);
}

async function loadPrincipal(ctx: Pick<AuthContext, 'id' | 'kind'>) {
  if (ctx.kind === 'institution') {
    const institution = await InstitutionModel.findById(ctx.id);
    if (!institution || institution.status === 'suspended') return null;
    return { kind: 'institution' as const, institution, role: 'institution' as const };
  }
  const user = await UserModel.findById(ctx.id);
  if (!user || !user.isActive) return null;
  return { kind: 'user' as const, user, role: user.role as UserRole };
}

/**
 * Exchanges the refresh cookie for a new one (rotation). A token used again within a few seconds
 * (two tabs at once) gets an access token without a new cookie; a token used again later means it
 * was copied, so every session from that sign-in is revoked.
 */
export async function refreshSession(req: Request, res: Response, scope: RefreshCookieScope) {
  const token = req.cookies?.[REFRESH_COOKIE[scope]] as string | undefined;
  if (!token) throw ApiError.unauthorized('No active session');

  const session = await SessionModel.findOne({ tokenHash: hashToken(token) });
  if (!session || session.expiresAt < new Date()) {
    clearRefreshCookie(res, scope);
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  const principal = await loadPrincipal({ id: String(session.subject), kind: session.kind as 'user' });
  if (!principal) {
    clearRefreshCookie(res, scope);
    throw ApiError.unauthorized('Account is not active');
  }
  if (scope === 'admin' && !STAFF_ROLES.includes(principal.role as UserRole)) {
    throw ApiError.forbidden();
  }
  const ctx = { id: String(session.subject), kind: principal.kind, role: principal.role };

  // Claim the rotation atomically; losing the race means another request already rotated it.
  const claimed = session.rotatedAt
    ? null
    : await SessionModel.findOneAndUpdate({ _id: session._id, rotatedAt: null }, { $set: { rotatedAt: new Date() } });
  if (!claimed) {
    const rotatedAt = (await SessionModel.findById(session._id).lean())?.rotatedAt ?? session.rotatedAt;
    if (rotatedAt && Date.now() - rotatedAt.getTime() <= ROTATION_GRACE_MS) {
      return { accessToken: await signAccessToken(ctx), ...serializePrincipal(principal) };
    }
    if (session.family) await SessionModel.deleteMany({ family: session.family });
    else await SessionModel.deleteOne({ _id: session._id });
    clearRefreshCookie(res, scope);
    logEvent('auth.refresh_reuse', { subject: String(session.subject), kind: session.kind, ip: req.ip }, 'warn');
    throw ApiError.unauthorized('Session expired, please sign in again');
  }

  const accessToken = await issueSession(req, res, scope, ctx, session.family ?? undefined);
  return { accessToken, ...serializePrincipal(principal) };
}

export async function logout(req: Request, res: Response, scope: RefreshCookieScope) {
  const token = req.cookies?.[REFRESH_COOKIE[scope]] as string | undefined;
  if (token) {
    const session = await SessionModel.findOneAndDelete({ tokenHash: hashToken(token) });
    if (session?.family) await SessionModel.deleteMany({ family: session.family });
  }
  clearRefreshCookie(res, scope);
}

type Principal = NonNullable<Awaited<ReturnType<typeof loadPrincipal>>>;

function serializePrincipal(p: Principal) {
  return p.kind === 'institution'
    ? { kind: p.kind, institution: p.institution.toJSON() }
    : { kind: p.kind, user: p.user.toJSON() };
}

export async function getMe(ctx: AuthContext) {
  const principal = await loadPrincipal(ctx);
  if (!principal) throw ApiError.unauthorized('Account is not active');
  return serializePrincipal(principal);
}

// ── Customer OTP ────────────────────────────────────────────────────────────

/** Creates and sends a one-time code. Shared by sign-in, password reset and order tracking. */
export async function issueOtp(phone: string, purpose: OtpPurpose = 'login') {
  const recent = await OtpModel.find({ phone, createdAt: { $gt: new Date(Date.now() - 3_600_000) } })
    .sort({ createdAt: -1 })
    .lean();
  const latest = recent.find((o) => (o.purpose ?? 'login') === purpose);
  if (latest && Date.now() - latest.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw ApiError.tooMany('Please wait a few seconds before requesting another code');
  }
  if (recent.length >= OTP_MAX_PER_HOUR) {
    throw ApiError.tooMany('Too many codes requested. Please try again in an hour');
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  // Only the newest code stays valid; older ones are kept briefly for rate limiting.
  await OtpModel.updateMany({ phone, purpose }, { $set: { attempts: OTP_MAX_ATTEMPTS } });
  await OtpModel.create({
    phone,
    purpose,
    codeHash: hashOtp(phone, code, purpose),
    expiresAt: new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000),
  });
  await notifications.sendOtp(phone, code);
  logEvent('auth.otp_sent', { phone: maskPhone(phone), purpose });

  return {
    expiresInSeconds: env.OTP_TTL_MINUTES * 60,
    resendInSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
    // Lets developers sign in without an SMS provider. Never returned in production.
    ...(!isProd && !env.MSG91_AUTH_KEY ? { devCode: code } : {}),
  };
}

/** Checks a code; wrong tries are counted. The code is used up on success. */
export async function checkOtp(phone: string, code: string, purpose: OtpPurpose = 'login') {
  const otp = await OtpModel.findOne({ phone, purpose: purpose === 'login' ? { $in: ['login', null] } : purpose }).sort({ createdAt: -1 });
  if (!otp || otp.expiresAt < new Date()) {
    throw ApiError.badRequest('Code expired. Please request a new one');
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw ApiError.tooMany('Too many wrong attempts. Please request a new code');
  }

  const expected = Buffer.from(otp.codeHash, 'hex');
  const actual = Buffer.from(hashOtp(phone, code, purpose), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    otp.attempts += 1;
    await otp.save();
    throw ApiError.badRequest('Incorrect code');
  }
  await OtpModel.deleteMany({ phone, purpose });
}

export const requestOtp = (phone: string) => issueOtp(phone, 'login');

export async function verifyOtp(req: Request, res: Response, phone: string, code: string, name?: string) {
  await checkOtp(phone, code, 'login');

  let user = await UserModel.findOne({ phone });
  const isNew = !user;
  if (!user) user = await UserModel.create({ phone, name: name ?? '', role: 'customer' });
  else if (name && !user.name) user.name = name;
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled');
  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = await issueSession(req, res, 'website', {
    id: user.id,
    kind: 'user',
    role: user.role as UserRole,
  });
  return { accessToken, isNew, kind: 'user' as const, user: user.toJSON() };
}

// ── Institutions ────────────────────────────────────────────────────────────

export async function registerInstitution(
  req: Request,
  res: Response,
  input: z.infer<typeof institutionRegisterSchema>,
) {
  const exists = await InstitutionModel.exists({ email: input.email });
  if (exists) throw ApiError.conflict('An institution with this email is already registered');

  const { password, ...rest } = input;
  const institution = await InstitutionModel.create({
    ...rest,
    passwordHash: await hashPassword(password),
    status: 'pending',
  });

  const accessToken = await issueSession(req, res, 'website', {
    id: institution.id,
    kind: 'institution',
    role: 'institution',
  });
  return { accessToken, kind: 'institution' as const, institution: institution.toJSON() };
}

export async function loginInstitution(req: Request, res: Response, email: string, password: string) {
  const institution = await InstitutionModel.findOne({ email }).select('+passwordHash');
  const ok = institution && (await bcrypt.compare(password, institution.passwordHash));
  if (!institution || !ok) throw ApiError.unauthorized('Incorrect email or password');
  if (institution.status === 'suspended') {
    throw ApiError.forbidden('This account is suspended. Please contact the shop.');
  }
  institution.lastLoginAt = new Date();
  await institution.save();

  const accessToken = await issueSession(req, res, 'website', {
    id: institution.id,
    kind: 'institution',
    role: 'institution',
  });
  return { accessToken, kind: 'institution' as const, institution: institution.toJSON() };
}

// ── Staff ───────────────────────────────────────────────────────────────────

export async function loginStaff(req: Request, res: Response, email: string, password: string) {
  const user = await UserModel.findOne({ email, role: { $in: STAFF_ROLES } }).select('+passwordHash');
  const ok = user?.passwordHash && (await bcrypt.compare(password, user.passwordHash));
  if (!user || !ok) throw ApiError.unauthorized('Incorrect email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled');
  user.lastLoginAt = new Date();
  await user.save();

  const accessToken = await issueSession(req, res, 'admin', {
    id: user.id,
    kind: 'user',
    role: user.role as UserRole,
  });
  return { accessToken, kind: 'user' as const, user: user.toJSON() };
}

// ── Institution password reset (code sent to the phone on the account) ─────

const RESET_SENT = {
  sent: true,
  message: 'If this email is registered, a 6-digit code has been sent to the phone number on the account.',
};

export async function requestInstitutionPasswordReset(email: string) {
  const institution = await InstitutionModel.findOne({ email }).lean();
  // Same answer whether or not the email exists, so accounts cannot be discovered.
  if (!institution || institution.status === 'suspended') return RESET_SENT;
  const issued = await issueOtp(institution.phone, 'password_reset');
  return { ...RESET_SENT, phoneHint: maskPhone(institution.phone), ...('devCode' in issued ? { devCode: issued.devCode } : {}) };
}

export async function resetInstitutionPassword(req: Request, email: string, code: string, password: string) {
  const institution = await InstitutionModel.findOne({ email }).select('+passwordHash');
  if (!institution || institution.status === 'suspended') throw ApiError.badRequest('Incorrect code');
  await checkOtp(institution.phone, code, 'password_reset');
  institution.passwordHash = await hashPassword(password);
  await institution.save();
  // Signed out everywhere: whoever knew the old password loses access.
  await SessionModel.deleteMany({ subject: institution._id });
  audit(req, { action: 'institution.password_reset', entity: 'Institution', entityId: institution._id, summary: institution.name });
  logEvent('auth.password_reset', { institution: institution.id });
  return { ok: true };
}
