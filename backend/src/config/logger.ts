import pino from 'pino';
import { env, isProd } from './env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : isProd ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-razorpay-signature"]',
      'req.headers["x-hub-signature-256"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.code',
      '*.codeHash',
      '*.otp',
      '*.token',
      '*.accessToken',
      '*.razorpay_signature',
    ],
    censor: '[redacted]',
  },
  transport: isProd || env.NODE_ENV === 'test'
    ? undefined
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          // Request lines already say method, path, status and time; keep only the id and user.
          ignore: 'pid,hostname,req,res,ms',
          messageFormat: '{msg}{if req.id} · {req.id}{end}{if user} · {user}{end}',
          singleLine: true,
        },
      },
});

/** 9876543210 → 98****3210, so logs stay useful without exposing customers' numbers. */
export function maskPhone(phone?: string | null) {
  if (!phone) return phone ?? undefined;
  const digits = phone.replace(/\D/g, '');
  return digits.length < 6 ? '****' : `${digits.slice(0, 2)}****${digits.slice(-4)}`;
}

/** One structured line per business event, e.g. `logEvent('order.created', { orderNumber })`. */
export function logEvent(event: string, fields: Record<string, unknown> = {}, level: 'info' | 'warn' | 'error' = 'info') {
  logger[level]({ event, ...fields }, event);
}
