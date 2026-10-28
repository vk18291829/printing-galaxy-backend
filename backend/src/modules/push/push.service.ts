import webpush from 'web-push';
import { Schema, model } from 'mongoose';
import { permissionsFor, type Permission } from '@/common/permissions';
import { env, pushEnabled } from '@/config/env';
import { logger } from '@/config/logger';
import { UserModel } from '@/modules/users/user.model';

/** One browser / phone a staff member turned notifications on for. */
const subscriptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    userAgent: String,
  },
  { timestamps: true },
);
export const PushSubscriptionModel = model('PushSubscription', subscriptionSchema);

let configured = false;
function configure() {
  if (configured || !pushEnabled()) return pushEnabled();
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  configured = true;
  return true;
}

/** What an alert is about; the admin app picks its icon from this. */
export const ALERT_KINDS = ['order', 'quote', 'proof', 'payment', 'cancel', 'institution', 'review', 'files'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/**
 * Every staff alert is also kept for the admin app's notification list (bell), for 30 days.
 * `readBy` holds the staff who have seen it, so each person has their own unread count.
 */
const alertSchema = new Schema(
  {
    kind: { type: String, enum: ALERT_KINDS, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    path: { type: String, required: true },
    permission: { type: String, required: true, index: true },
    readBy: { type: [Schema.Types.ObjectId], default: [] },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
  },
  { versionKey: false },
);
alertSchema.index({ createdAt: -1 });
export const StaffAlertModel = model('StaffAlert', alertSchema);

export interface StaffAlert {
  kind: AlertKind;
  title: string;
  body: string;
  /** Admin path to open on tap, e.g. /orders/<id>. */
  path: string;
  /** Only staff whose roles grant this see it (the owner always does). */
  permission: Permission;
  /** Notifications with the same tag replace each other on the phone. */
  tag?: string;
}

/**
 * Sends a phone notification to every active staff member allowed to act on it. Never throws:
 * a failed push must not fail the order that triggered it. Dead subscriptions are removed.
 */
export async function notifyStaff(alert: StaffAlert) {
  try {
    await StaffAlertModel.create({ kind: alert.kind, title: alert.title, body: alert.body, path: alert.path, permission: alert.permission });
  } catch (err) {
    logger.warn({ err }, 'Could not save staff alert');
  }
  if (!configure()) return 0;
  try {
    const staff = await UserModel.find({ role: { $in: ['admin', 'staff'] }, isActive: true }).select('role staffRoles').lean();
    const ids = staff.filter((u) => permissionsFor(u.role, u.staffRoles).includes(alert.permission)).map((u) => u._id);
    const subs = await PushSubscriptionModel.find({ user: { $in: ids } }).lean();
    const payload = JSON.stringify({ title: alert.title, body: alert.body, url: `${env.ADMIN_URL.replace(/\/$/, '')}${alert.path}`, tag: alert.tag });
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          if (!s.keys) return;
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }, payload, { TTL: 3600 });
          sent += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) await PushSubscriptionModel.deleteOne({ _id: s._id });
          else logger.warn({ err, status }, 'Push failed');
        }
      }),
    );
    return sent;
  } catch (err) {
    logger.warn({ err }, 'Staff notification failed');
    return 0;
  }
}
