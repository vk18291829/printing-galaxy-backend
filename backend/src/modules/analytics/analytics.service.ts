import crypto from 'node:crypto';
import { env } from '@/config/env';
import { PageDayModel, TrafficDayModel, VisitorDayModel } from './analytics.model';

const IST_OFFSET_MS = 330 * 60_000;

/** The calendar day in India, as YYYY-MM-DD. */
export const istDay = (d = new Date()) => new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|axios|node-fetch|go-http/i;
export const isBot = (userAgent: string) => !userAgent || BOT.test(userAgent);

/**
 * Keeps only the shape of a page address: query strings are dropped, and anything that could
 * identify a person or a private link (order ids, share tokens, account pages) is generalised.
 */
export function cleanPath(raw: string) {
  let path = (raw.split(/[?#]/)[0] ?? '/').toLowerCase().slice(0, 200) || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, '');
  if (path.startsWith('/p/')) return '/p/:link';
  if (path.startsWith('/account/orders/')) return '/account/orders/:id';
  if (path.startsWith('/unsubscribe')) return '/unsubscribe';
  // Ids and tokens anywhere else.
  return path
    .split('/')
    .map((s) => (/^[a-f0-9]{24}$/.test(s) || /^[\w-]{20,}$/.test(s) ? ':id' : s))
    .join('/');
}

const SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|yandex|ecosia|baidu)\./i;
const SOCIAL = /(^|\.)(facebook|fb|instagram|whatsapp|wa\.me|t\.co|twitter|x\.com|linkedin|youtube|pinterest|telegram|snapchat)/i;

/** Where the visitor came from, from the referring site (only its name is kept). */
export function sourceOf(referrer: string | undefined, ownHost: string | undefined) {
  if (!referrer) return 'direct' as const;
  let host = '';
  try {
    host = new URL(referrer).hostname;
  } catch {
    return 'direct' as const;
  }
  if (ownHost && host === ownHost) return null; // moving between our own pages
  if (SEARCH.test(host)) return 'search' as const;
  if (SOCIAL.test(host)) return 'social' as const;
  return 'other' as const;
}

export const deviceOf = (width: number) => (width < 768 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop');

/** Counts one page view. Never throws: a failed count must not affect the visitor. */
export async function recordPageView(input: {
  path: string;
  referrer?: string;
  width: number;
  ip: string;
  userAgent: string;
  ownHost?: string;
  /** First page of this visit (the browser tab), so sources and devices are counted once per visit. */
  landing: boolean;
}) {
  const date = istDay();
  const path = cleanPath(input.path);
  // Changes every day and needs the server secret: not reversible, not linkable across days.
  const visitor = crypto.createHmac('sha256', env.JWT_ACCESS_SECRET).update(`${date}|${input.ip}|${input.userAgent}`).digest('base64url');

  let newVisitor = false;
  try {
    await VisitorDayModel.create({ _id: `${date}:${visitor}` });
    newVisitor = true;
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }

  const inc: Record<string, number> = { views: 1 };
  if (newVisitor) inc.visitors = 1;
  if (input.landing) {
    const source = sourceOf(input.referrer, input.ownHost);
    if (source) inc[`sources.${source}`] = 1;
    inc[`devices.${deviceOf(input.width)}`] = 1;
  }
  await Promise.all([
    TrafficDayModel.updateOne({ date }, { $inc: inc }, { upsert: true }),
    PageDayModel.updateOne({ date, path }, { $inc: { views: 1 } }, { upsert: true }),
  ]);
}

/** Totals for the last `days` days (today included), for the admin dashboard. */
export async function trafficSummary(days: number) {
  const dates = Array.from({ length: days }, (_, i) => istDay(new Date(Date.now() - (days - 1 - i) * 86_400_000)));
  const [rows, pages] = await Promise.all([
    TrafficDayModel.find({ date: { $in: dates } }).lean(),
    PageDayModel.aggregate<{ _id: string; views: number }>([
      { $match: { date: { $in: dates } } },
      { $group: { _id: '$path', views: { $sum: '$views' } } },
      { $sort: { views: -1 } },
      { $limit: 8 },
    ]),
  ]);
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const series = dates.map((date) => ({ date, views: byDate.get(date)?.views ?? 0, visitors: byDate.get(date)?.visitors ?? 0 }));
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((n, r) => n + pick(r), 0);
  return {
    series,
    totals: { views: sum((r) => r.views), visitors: sum((r) => r.visitors) },
    today: series.at(-1)!,
    sources: {
      direct: sum((r) => r.sources?.direct ?? 0),
      search: sum((r) => r.sources?.search ?? 0),
      social: sum((r) => r.sources?.social ?? 0),
      other: sum((r) => r.sources?.other ?? 0),
    },
    devices: {
      mobile: sum((r) => r.devices?.mobile ?? 0),
      tablet: sum((r) => r.devices?.tablet ?? 0),
      desktop: sum((r) => r.devices?.desktop ?? 0),
    },
    topPages: pages.map((p) => ({ path: p._id, views: p.views })),
  };
}
