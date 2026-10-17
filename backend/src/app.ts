import { randomUUID } from 'node:crypto';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env, isProd } from '@/config/env';
import { logger } from '@/config/logger';
import { errorHandler, notFound } from '@/middleware/error-handler';
import { apiLimiter } from '@/middleware/rate-limit';
import { apiRouter } from '@/routes';

// localhost, 127.0.0.1 and private LAN addresses (testing on a phone) on any port.
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

function isAllowedOrigin(origin?: string) {
  if (!origin) return true;
  if (env.CORS_ORIGINS.includes(origin)) return true;
  return !isProd && DEV_ORIGIN.test(origin);
}

const SLOW_MS = 1000;

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, cb) => cb(null, isAllowedOrigin(origin)),
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(
    express.json({
      limit: '1mb',
      // Keep the raw body for webhook signature verification.
      verify: (req, _res, buf) => {
        if ((req as express.Request).originalUrl?.includes('/webhook')) {
          (req as express.Request).rawBody = Buffer.from(buf);
        }
      },
    }),
  );
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      // Every request gets an id (or keeps the proxy's), returned as X-Request-Id and shown in errors.
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID().slice(0, 12);
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      // Short request/response objects: method, path, status; never bodies or headers.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ status: res.statusCode }),
      },
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      customSuccessMessage: (req, res, responseTime) =>
        `${req.method} ${req.originalUrl ?? req.url} ${res.statusCode} · ${Math.round(responseTime)}ms${responseTime > SLOW_MS ? ' (slow)' : ''}`,
      customErrorMessage: (req, res, err) => `${req.method} ${req.originalUrl ?? req.url} ${res.statusCode} · ${err.message}`,
      // Who made the request, added once auth has run.
      customSuccessObject: (req, _res, val: Record<string, unknown>) => {
        const auth = (req as express.Request).auth;
        return { ...val, ...(auth ? { user: `${auth.role ?? auth.kind}:${auth.id}` } : {}) };
      },
      customAttributeKeys: { responseTime: 'ms' },
    }),
  );

  app.use('/api/v1', apiLimiter, apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
