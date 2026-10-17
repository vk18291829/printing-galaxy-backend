import { env, isProd, razorpayEnabled } from './env';
import { logger } from './logger';

const EXAMPLE_SECRETS = [
  'change-me-access-secret-at-least-32-characters',
  'change-me-refresh-secret-at-least-32-characters',
];

/**
 * Production start-up checks. Problems that make the deployment unsafe stop the server;
 * missing integrations are printed as warnings so the owner can still set up the admin panel.
 */
export function readinessReport() {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (EXAMPLE_SECRETS.includes(env.JWT_ACCESS_SECRET) || EXAMPLE_SECRETS.includes(env.JWT_REFRESH_SECRET)) {
    errors.push('JWT_ACCESS_SECRET / JWT_REFRESH_SECRET still have the example values from .env.example');
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  }

  if (!env.COOKIE_SECURE) warnings.push('COOKIE_SECURE is off: set it to true once the site runs on HTTPS');
  if (env.CORS_ORIGINS.every((o) => /localhost|127\.0\.0\.1/.test(o))) {
    warnings.push('CORS_ORIGINS only lists localhost: add the website and admin URLs');
  }
  if (!env.MSG91_AUTH_KEY || !env.MSG91_OTP_TEMPLATE_ID) {
    warnings.push('MSG91 is not configured: customers cannot receive login codes, so phone sign-in is switched off');
  }
  if (!razorpayEnabled()) warnings.push('Razorpay keys are missing: only pay-at-counter is offered');
  else if (!env.RAZORPAY_WEBHOOK_SECRET) warnings.push('RAZORPAY_WEBHOOK_SECRET is missing: payments made after the browser closes are only found by the reconciliation job');
  if (env.S3_ENDPOINT?.includes('localhost')) warnings.push('S3_ENDPOINT points at localhost: use AWS S3 (leave it empty) or a real S3 service');
  if (env.SEED_ADMIN_PASSWORD === 'ChangeMe@123') warnings.push('SEED_ADMIN_PASSWORD is the default: change the owner password after seeding');

  return { production: isProd, errors, warnings };
}

export function checkProductionReadiness() {
  if (!isProd) return;
  const { errors, warnings } = readinessReport();
  for (const w of warnings) logger.warn({ check: 'readiness' }, `⚠️  ${w}`);
  if (errors.length) {
    for (const e of errors) logger.fatal({ check: 'readiness' }, `❌ ${e}`);
    throw new Error('Production configuration is unsafe; fix the errors above');
  }
  logger.info({ check: 'readiness', warnings: warnings.length }, warnings.length ? 'Production checks passed with warnings' : 'Production checks passed');
}
