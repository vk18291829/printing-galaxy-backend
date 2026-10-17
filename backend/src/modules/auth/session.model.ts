import { Schema, model } from 'mongoose';

const sessionSchema = new Schema(
  {
    subject: { type: Schema.Types.ObjectId, required: true, index: true },
    kind: { type: String, enum: ['user', 'institution'], required: true },
    tokenHash: { type: String, required: true, unique: true },
    /** All sessions created by rotating one sign-in share a family; reuse of an old token revokes it. */
    family: { type: Schema.Types.ObjectId, index: true },
    /** Set when this token was exchanged for a new one. */
    rotatedAt: Date,
    userAgent: String,
    ip: String,
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = model('Session', sessionSchema);
