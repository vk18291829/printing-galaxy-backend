import { Schema, model } from 'mongoose';

const otpSchema = new Schema(
  {
    phone: { type: String, required: true, index: true },
    /** login: customer sign-in · password_reset: institution password · track: order tracking without an account */
    purpose: { type: String, enum: ['login', 'password_reset', 'track'], default: 'login' },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// MongoDB removes the document automatically once it expires.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OtpModel = model('Otp', otpSchema);
