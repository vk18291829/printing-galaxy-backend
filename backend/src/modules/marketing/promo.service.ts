import crypto from 'node:crypto';
import { ApiError } from '@/common/errors';
import { emailChannel, emailEnabled, env } from '@/config/env';
import { logger } from '@/config/logger';
import { sendMail } from '@/modules/notifications/mailer';
import { sendSms } from '@/modules/notifications/notification.service';
import { UserModel } from '@/modules/users/user.model';
import { CampaignModel, type CampaignDoc } from './promo.model';

const VAR = /\{#var#\}/gi;
const SMS_BATCH = 100;
/** Gmail drops connections when mail is pushed too fast; this keeps well under its rate. */
const EMAIL_GAP_MS = 400;
/** Stop after this many failures in a row, e.g. Gmail's daily sending limit. */
const MAX_FAILS_IN_A_ROW = 5;
/** A campaign still "sending" this long after its last update was cut off by a restart. */
const STALE_MS = 10 * 60_000;

export const countVars = (text: string) => text.match(VAR)?.length ?? 0;

/** The template text with each {#var#} replaced by its value, as customers will read it. */
export const fillTemplate = (text: string, params: string[]) => {
  let i = 0;
  return text.replace(VAR, () => params[i++] ?? '');
};

/** Checks the values fit the SMS template: one per {#var#}, at most 30 characters, no line breaks. */
export function checkParams(text: string, params: string[]) {
  const needed = countVars(text);
  if (params.length !== needed) throw ApiError.badRequest(`This template needs ${needed} value${needed === 1 ? '' : 's'}`);
  params.forEach((p, i) => {
    if (!p.trim()) throw ApiError.badRequest(`Fill in value ${i + 1}`);
    if (p.length > 30) throw ApiError.badRequest(`Value ${i + 1} is longer than 30 characters`);
    if (/[\r\n]/.test(p)) throw ApiError.badRequest(`Value ${i + 1} cannot have line breaks`);
  });
}

/** TRAI allows promotional SMS only between 10 AM and 9 PM. Emails can go any time. */
export function insideSendWindow(now = new Date()) {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minutes >= 10 * 60 && minutes < 21 * 60;
}

// ── Unsubscribe links ───────────────────────────────────────────────────────

const unsubscribeToken = (userId: string) =>
  crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(`unsubscribe:${userId}`).digest('base64url').slice(0, 32);

export const unsubscribeUrl = (userId: string) =>
  `${env.WEBSITE_URL.replace(/\/$/, '')}/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`;

/** Turns offers off for the user in a signed unsubscribe link. */
export async function unsubscribe(userId: string, token: string) {
  const expected = Buffer.from(unsubscribeToken(userId));
  const actual = Buffer.from(token);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) throw ApiError.badRequest('This link is not valid');
  await UserModel.updateOne({ _id: userId }, { $set: { offers: false } });
}

// ── Audience ────────────────────────────────────────────────────────────────

/** Customers who can get offers on this channel: active, reachable, and not opted out. */
const audienceFilter = () => ({
  role: 'customer',
  isActive: true,
  offers: { $ne: false },
  ...(emailChannel() ? { email: { $exists: true, $ne: '' } } : { phone: { $exists: true, $ne: '' } }),
});

export const audienceCount = () => UserModel.countDocuments(audienceFilter());

export async function audience() {
  const users = await UserModel.find(audienceFilter()).select('email phone name').lean();
  return emailChannel()
    ? users.filter((u) => u.email).map((u) => ({ id: String(u._id), to: u.email!, name: u.name }))
    : users.filter((u) => /^\d{10}$/.test(u.phone ?? '')).map((u) => ({ id: String(u._id), to: u.phone!, name: u.name }));
}

export const promoReady = () => (emailChannel() ? emailEnabled() : Boolean(env.MSG91_AUTH_KEY));

/** Marks campaigns that stopped mid-way (server restart) so they are not shown as sending forever. */
export async function markStaleCampaigns() {
  await CampaignModel.updateMany(
    { status: 'sending', updatedAt: { $lt: new Date(Date.now() - STALE_MS) } },
    { $set: { status: 'stopped', error: 'Stopped before finishing (server restart). People not reached are not retried automatically.', finishedAt: new Date() } },
  );
}

// ── Sending ─────────────────────────────────────────────────────────────────

export function promoEmail(campaign: { title: string; text: string; link?: string | null; buttonLabel?: string | null }, to: { id: string; to: string }) {
  return {
    to: to.to,
    subject: campaign.title,
    text: campaign.text,
    action: campaign.link ? { label: campaign.buttonLabel || 'Shop now', url: campaign.link } : undefined,
    footer: { text: 'You get these emails because you have an account with us.', url: unsubscribeUrl(to.id), linkLabel: 'Stop offer emails' },
    headers: { 'List-Unsubscribe': `<${unsubscribeUrl(to.id)}>` },
  };
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runEmail(campaign: CampaignDoc, people: { id: string; to: string }[]) {
  let failsInARow = 0;
  for (const [i, person] of people.entries()) {
    try {
      if (emailEnabled()) await sendMail(promoEmail(campaign, person));
      else logger.info({ to: person.to }, `📣 ${campaign.title}`);
      campaign.sent += 1;
      failsInARow = 0;
    } catch (err) {
      campaign.failed += 1;
      campaign.error = (err as Error).message;
      failsInARow += 1;
      logger.warn({ err, campaign: campaign.id }, 'Promotional email failed');
      if (failsInARow >= MAX_FAILS_IN_A_ROW) {
        campaign.status = 'stopped';
        campaign.error = `Stopped after ${MAX_FAILS_IN_A_ROW} failures in a row (Gmail may have reached its daily limit): ${campaign.error}`;
        return;
      }
    }
    // Save progress every 20 emails so the admin page can show it.
    if (i % 20 === 19) await campaign.save();
    if (emailEnabled()) await pause(EMAIL_GAP_MS);
  }
}

async function runSms(campaign: CampaignDoc, people: { to: string }[]) {
  for (let i = 0; i < people.length; i += SMS_BATCH) {
    const batch = people.slice(i, i + SMS_BATCH).map((p) => p.to);
    try {
      if (env.MSG91_AUTH_KEY) await sendSms(batch, campaign.msg91TemplateId!, campaign.params ?? []);
      else logger.info({ count: batch.length }, `📣 ${campaign.text}`);
      campaign.sent += batch.length;
    } catch (err) {
      campaign.failed += batch.length;
      campaign.error = (err as Error).message;
      logger.warn({ err, campaign: campaign.id }, 'Promotional SMS batch failed');
    }
    await campaign.save();
  }
}

/** Sends the campaign and records progress. Never throws. */
export async function runCampaign(campaign: CampaignDoc, people: { id: string; to: string }[]) {
  try {
    if (campaign.channel === 'email') await runEmail(campaign, people);
    else await runSms(campaign, people);
    if (campaign.status === 'sending') campaign.status = campaign.sent === 0 && campaign.total > 0 ? 'failed' : 'sent';
  } catch (err) {
    campaign.status = 'failed';
    campaign.error = (err as Error).message;
    logger.error({ err, campaign: campaign.id }, 'Promotional campaign failed');
  }
  campaign.finishedAt = new Date();
  await campaign.save().catch((err) => logger.error({ err }, 'Could not save campaign'));
}
