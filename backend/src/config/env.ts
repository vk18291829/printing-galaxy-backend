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

  WHATSAPP_TOKEN: optional,
  WHATSAPP_PHONE_NUMBER_ID: optional,
  /** Approved template names. Business-initiated messages outside the 24-hour window must use them. */
  WHATSAPP_TEMPLATE_ORDER_STATUS: optional,
  WHATSAPP_TEMPLATE_ACCOUNT_UPDATE: optional,
  WHATSAPP_TEMPLATE_STAFF_ALERT: optional,
  /** Webhook: verify token you type into the Meta dashboard, and the app secret for signatures. */
  WHATSAPP_VERIFY_TOKEN: optional,
  WHATSAPP_APP_SECRET: optional,
  MSG91_AUTH_KEY: optional,
  MSG91_SENDER_ID: z.string().default('PRNTGL'),
  MSG91_OTP_TEMPLATE_ID: optional,
  /** DLT-registered MSG91 flow template for status SMS (variables: var1 = message). */
  MSG91_STATUS_TEMPLATE_ID: optional,

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
