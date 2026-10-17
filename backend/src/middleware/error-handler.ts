import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { ApiError } from '@/common/errors';
import { isProd } from '@/config/env';
import { logger } from '@/config/logger';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, `Route ${req.method} ${req.originalUrl} not found`, 'NOT_FOUND'));
};

/** Every error body carries the request id, so a customer can quote it to the shop. */
function send(res: Response, status: number, error: { code: string; message: string; details?: unknown }) {
  const requestId = (res.req as { id?: string }).id;
  res.status(status).json({ error: { ...error, ...(requestId ? { requestId } : {}) } });
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    send(res, 422, {
      code: 'VALIDATION_ERROR',
      message: err.issues[0]?.message ?? 'Invalid input',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  if (err instanceof ApiError) {
    send(res, err.status, { code: err.code, message: err.message, details: err.details });
    return;
  }

  if (err instanceof mongoose.Error.ValidationError) {
    send(res, 422, {
      code: 'VALIDATION_ERROR',
      message: Object.values(err.errors)[0]?.message ?? 'Invalid input',
      details: Object.entries(err.errors).map(([path, e]) => ({ path, message: e.message })),
    });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    send(res, 400, { code: 'BAD_REQUEST', message: `Invalid ${err.path}` });
    return;
  }

  // Two people (or a person and a payment webhook) changed the same order at once.
  if (err instanceof mongoose.Error.VersionError) {
    send(res, 409, { code: 'STALE', message: 'This was just updated by someone else. Refresh and try again.' });
    return;
  }

  if (typeof err === 'object' && err && 'code' in err && err.code === 11000) {
    const field = Object.keys((err as { keyValue?: object }).keyValue ?? {})[0] ?? 'value';
    send(res, 409, { code: 'CONFLICT', message: `This ${field} is already in use` });
    return;
  }

  if (err?.type === 'entity.too.large') {
    send(res, 413, { code: 'PAYLOAD_TOO_LARGE', message: 'Request is too large' });
    return;
  }

  logger.error({ err, reqId: (req as { id?: string }).id, url: req.originalUrl }, 'Unhandled error');
  send(res, 500, {
    code: 'INTERNAL_ERROR',
    message: isProd ? 'Something went wrong on our side. Please try again.' : String(err?.message ?? err),
  });
};
