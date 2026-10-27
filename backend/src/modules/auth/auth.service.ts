import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { ApiError } from '@/common/errors';
import { STAFF_ROLES, type AuthContext, type UserRole } from '@/common/types';
import { emailChannel, emailEnabled, env, isProd } from '@/config/env';
import { logEvent, maskPhone } from '@/config/logger';
import { audit } from '@/modules/audit/audit.model';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { notifications } from '@/modules/notifications/notification.service';
import { UserModel } from '@/modules/users/user.model';
import type { z } from 'zod';
import { OtpModel } from './otp.model';
import { SessionModel } from './session.model';
import { assertContactAvailable } from './unique-contact';
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

const hashOtp = (to: string, code: string, purpose: OtpPurpose = 'login') =>
  crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(purpose === 'login' ? `${to}:${code}` : `${purpose}:${to}:${code}`).digest('hex');

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

/** Where a code goes: a 10-digit mobile number (SMS) or an email address. */
const maskTarget = (to: string) => (to.includes('@') ? to.replace(/^(.).*(@.*)$/, '$1***$2') : maskPhone(to));

/** Creates and sends a one-time code. Shared by sign-in, password reset and order tracking. */
export async function issueOtp(to: string, purpose: OtpPurpose = 'login', lang: 'en' | 'hi' = 'en') {
  const recent = await OtpModel.find({ to, createdAt: { $gt: new Date(Date.now() - 3_600_000) } })
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
  await OtpModel.updateMany({ to, purpose }, { $set: { attempts: OTP_MAX_ATTEMPTS } });
  await OtpModel.create({
    to,
    purpose,
    codeHash: hashOtp(to, code, purpose),
    expiresAt: new Date(Date.now() + env.OTP_TTL_MINUTES * 60_000),
  });
  await notifications.sendOtp(to, code, purpose, lang);
  logEvent('auth.otp_sent', { to: maskTarget(to), purpose });

  const providerReady = to.includes('@') ? emailEnabled() : Boolean(env.MSG91_AUTH_KEY);
  return {
    expiresInSeconds: env.OTP_TTL_MINUTES * 60,
    resendInSeconds: OTP_RESEND_COOLDOWN_MS / 1000,
    // Lets developers sign in without Gmail / SMS set up. Never returned in production.
    ...(!isProd && !providerReady ? { devCode: code } : {}),
  };
}

/** Checks a code; wrong tries are counted. The code is used up on success. */
export async function checkOtp(to: string, code: string, purpose: OtpPurpose = 'login') {
  const otp = await OtpModel.findOne({ to, purpose: purpose === 'login' ? { $in: ['login', null] } : purpose }).sort({ createdAt: -1 });
  if (!otp || otp.expiresAt < new Date()) {
    throw ApiError.badRequest('Code expired. Please request a new one');
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    throw ApiError.tooMany('Too many wrong attempts. Please request a new code');
  }

  const expected = Buffer.from(otp.codeHash, 'hex');
  const actual = Buffer.from(hashOtp(to, code, purpose), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    otp.attempts += 1;
    await otp.save();
    throw ApiError.badRequest('Incorrect code');
  }
  await OtpModel.deleteMany({ to, purpose });
}

/** Customers sign in with whatever MESSAGING_CHANNEL uses: email, or mobile number by SMS. */
function loginTarget(input: { email?: string; phone?: string }) {
  if (emailChannel()) {
    if (!input.email) throw ApiError.badRequest('Enter your email address');
    return { email: input.email };
  }
  if (!input.phone) throw ApiError.badRequest('Enter your mobile number');
  return { phone: input.phone };
}

export async function requestOtp(input: { email?: string; phone?: string; lang?: 'en' | 'hi' }) {
  const target = loginTarget(input);
  // Someone new can't sign up with a number or email another account already uses.
  if (!(await UserModel.exists(target))) await assertContactAvailable(target);
  return issueOtp(target.email ?? target.phone!, 'login', input.lang);
}

export async function verifyOtp(
  req: Request,
  res: Response,
  input: { email?: string; phone?: string; lang?: 'en' | 'hi' },
  code: string,
  name?: string,
) {
  const target = loginTarget(input);
  await checkOtp(target.email ?? target.phone!, code, 'login');

  let user = await UserModel.findOne(target);
  const isNew = !user;
  if (!user) await assertContactAvailable(target);
  if (!user) user = await UserModel.create({ ...target, name: name ?? '', role: 'customer', language: input.lang ?? 'en' });
  else if (name && !user.name) user.name = name;
  if (!user.isActive) throw ApiError.forbidden('This account has been disabled');
  user.lastLoginAt = new Date();
  await user.save();
  if (isNew && user.email) void notifications.welcome({ email: user.email, name: user.name, lang: user.language as 'en' | 'hi' });

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
  await assertContactAvailable({ email: input.email, phone: input.phone });

  const { password, lang, ...rest } = input;
  const institution = await InstitutionModel.create({
    ...rest,
    language: lang ?? 'en',
    passwordHash: await hashPassword(password),
    status: 'pending',
  });
  void notifications.institutionRegistered({ email: institution.email, name: institution.name, contactName: institution.contactName, lang: lang ?? 'en' });

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

// ── Institution password reset (code to the account email, or its phone by SMS) ──

const resetSent = () => ({
  sent: true,
  sentTo: emailChannel() ? ('email' as const) : ('phone' as const),
  message: emailChannel()
    ? 'If this email is registered, a 6-digit code has been sent to it.'
    : 'If this email is registered, a 6-digit code has been sent to the phone number on the account.',
});

const resetTarget = (institution: { email: string; phone: string }) => (emailChannel() ? institution.email : institution.phone);

export async function requestInstitutionPasswordReset(email: string, lang?: 'en' | 'hi') {
  const institution = await InstitutionModel.findOne({ email }).lean();
  // Same answer whether or not the email exists, so accounts cannot be discovered.
  if (!institution || institution.status === 'suspended') return resetSent();
  const issued = await issueOtp(resetTarget(institution), 'password_reset', lang ?? (institution.language as 'en' | 'hi'));
  return {
    ...resetSent(),
    ...(emailChannel() ? {} : { phoneHint: maskPhone(institution.phone) }),
    ...('devCode' in issued ? { devCode: issued.devCode } : {}),
  };
}

export async function resetInstitutionPassword(req: Request, email: string, code: string, password: string) {
  const institution = await InstitutionModel.findOne({ email }).select('+passwordHash');
  if (!institution || institution.status === 'suspended') throw ApiError.badRequest('Incorrect code');
  await checkOtp(resetTarget(institution), code, 'password_reset');
  institution.passwordHash = await hashPassword(password);
  await institution.save();
  // Signed out everywhere: whoever knew the old password loses access.
  await SessionModel.deleteMany({ subject: institution._id });
  audit(req, { action: 'institution.password_reset', entity: 'Institution', entityId: institution._id, summary: institution.name });
  logEvent('auth.password_reset', { institution: institution.id });
  return { ok: true };
}
