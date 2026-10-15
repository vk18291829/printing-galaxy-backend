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
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );

  app.use('/api/v1', apiLimiter, apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
