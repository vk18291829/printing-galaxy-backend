import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { validate } from '@/middleware/validate';
import { isBot, recordPageView, trafficSummary } from './analytics.service';

/** Public: the website reports a page view (no cookies, nothing personal stored). */
export const analyticsRouter = Router();

const pageViewSchema = z.object({
  path: z.string().trim().min(1).max(300),
  referrer: z.string().trim().max(500).optional(),
  width: z.coerce.number().int().min(0).max(10_000).default(1024),
  landing: z.boolean().default(false),
});

// One person can't inflate the numbers: at most 120 page views a minute per address.
const pageViewLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: false, legacyHeaders: false, skip: () => env.NODE_ENV === 'test' });

analyticsRouter.post('/pageview', pageViewLimiter, validate({ body: pageViewSchema }), (req, res) => {
  // Answer straight away; counting happens after and never affects the visitor.
  res.status(204).end();
  const userAgent = String(req.headers['user-agent'] ?? '');
  // Browsers that ask not to be tracked are not counted.
  if (isBot(userAgent) || req.headers.dnt === '1' || req.headers['sec-gpc'] === '1') return;
  const body = req.body as z.infer<typeof pageViewSchema>;
  let ownHost: string | undefined;
  try {
    ownHost = req.headers.origin ? new URL(String(req.headers.origin)).hostname : undefined;
  } catch {
    ownHost = undefined;
  }
  void recordPageView({ ...body, ip: req.ip ?? '', userAgent, ownHost }).catch((err) => logger.warn({ err }, 'Page view not counted'));
});

/** Admin: visits for the dashboard. */
export const adminAnalyticsRouter = Router();

adminAnalyticsRouter.get('/traffic', validate({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(30) }) }), async (_req, res) => {
  const { days } = res.locals.query as { days: number };
  res.json(await trafficSummary(days));
});
