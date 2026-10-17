import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/printing-galaxy'),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OTP_TTL_MINUTES: z.coerce.number().int().positive().default(5),
  COOKIE_SECURE: bool,

  S3_REGION: z.string().default('ap-south-1'),
  S3_ENDPOINT: optional,
  S3_FORCE_PATH_STYLE: bool,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_PRIVATE_BUCKET: z.string().default('printing-galaxy-private'),
  S3_PUBLIC_BUCKET: z.string().default('printing-galaxy-public'),
  S3_PUBLIC_BASE_URL: optional,
  MAX_UPLOAD_MB: z.coerce.number().positive().default(100),

  RAZORPAY_KEY_ID: optional,
  RAZORPAY_KEY_SECRET: optional,
  RAZORPAY_WEBHOOK_SECRET: optional,

  /**
   * How customers sign in and get messages: 'email' (Gmail, login codes by email) or 'sms'
   * (MSG91, login codes by SMS; needs DLT registration).
   */
  MESSAGING_CHANNEL: z.enum(['email', 'sms']).default('email'),
  /** Gmail account and its 16-character App Password (Google Account → Security → App passwords). */
  GMAIL_USER: optional,
  GMAIL_APP_PASSWORD: optional,
  MAIL_FROM_NAME: z.string().default('Printing Galaxy'),
  /** Website address used for links in emails. */
  WEBSITE_URL: z.string().url().default('http://localhost:5173'),

  MSG91_AUTH_KEY: optional,
  MSG91_OTP_TEMPLATE_ID: optional,
  /**
   * MSG91 template ids, one per message type, each linked to a DLT-approved template. Variables
   * are ##var1##, ##var2## in MSG91 ({#var#} on DLT, 30 characters each). Bodies: see .env.example.
   */
  MSG91_TEMPLATE_ORDER_STATUS: optional,
  MSG91_TEMPLATE_PICKUP_CODE: optional,
  MSG91_TEMPLATE_DELIVERY_CODE: optional,
  MSG91_TEMPLATE_ACCOUNT_UPDATE: optional,
  MSG91_TEMPLATE_STAFF_ALERT: optional,

  /** Redis for the background job queue (BullMQ). Without it jobs run inside the API process. */
  REDIS_URL: optional,

  SEED_ADMIN_EMAIL: z.string().email().default('owner@printinggalaxy.in'),
  SEED_ADMIN_PASSWORD: z.string().min(8).default('ChangeMe@123'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
/** Read on every call so tests (and a restart-free key change) see the current env. */
export const razorpayEnabled = () => Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
export const emailEnabled = () => Boolean(env.GMAIL_USER && env.GMAIL_APP_PASSWORD);
/** True when customers sign in and get messages by email rather than SMS. */
export const emailChannel = () => env.MESSAGING_CHANNEL === 'email';
