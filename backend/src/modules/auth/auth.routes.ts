import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { authLimiter } from '@/middleware/rate-limit';
import { validate } from '@/middleware/validate';
import {
  institutionRegisterSchema,
  otpRequestSchema,
  otpVerifySchema,
  passwordLoginSchema,
} from './auth.schema';
import * as auth from './auth.service';

export const authRouter = Router();

// Customers (website)
authRouter.post('/otp/request', authLimiter, validate({ body: otpRequestSchema }), async (req, res) => {
  res.json(await auth.requestOtp(req.body.phone));
});

authRouter.post('/otp/verify', authLimiter, validate({ body: otpVerifySchema }), async (req, res) => {
  const { phone, code, name } = req.body;
  res.json(await auth.verifyOtp(req, res, phone, code, name));
});

// Institutions (website)
authRouter.post(
  '/institution/register',
  authLimiter,
  validate({ body: institutionRegisterSchema }),
  async (req, res) => {
    res.status(201).json(await auth.registerInstitution(req, res, req.body));
  },
);

authRouter.post(
  '/institution/login',
  authLimiter,
  validate({ body: passwordLoginSchema }),
  async (req, res) => {
    res.json(await auth.loginInstitution(req, res, req.body.email, req.body.password));
  },
);

authRouter.post('/refresh', async (req, res) => {
  res.json(await auth.refreshSession(req, res, 'website'));
});

authRouter.post('/logout', async (req, res) => {
  await auth.logout(req, res, 'website');
  res.status(204).end();
});

// Staff (admin panel) — separate cookie so both apps can be signed in at once
authRouter.post('/staff/login', authLimiter, validate({ body: passwordLoginSchema }), async (req, res) => {
  res.json(await auth.loginStaff(req, res, req.body.email, req.body.password));
});

authRouter.post('/staff/refresh', async (req, res) => {
  res.json(await auth.refreshSession(req, res, 'admin'));
});

authRouter.post('/staff/logout', async (req, res) => {
  await auth.logout(req, res, 'admin');
  res.status(204).end();
});

authRouter.get('/me', authenticate, async (req, res) => {
  res.json(await auth.getMe(req.auth!));
});
