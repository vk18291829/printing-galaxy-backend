import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { STAFF_ROLE_KEYS } from '@/common/permissions';
import { addressSchema, USER_ROLES } from '@/common/types';

const userSchema = new Schema(
  {
    name: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, unique: true, sparse: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: USER_ROLES, default: 'customer', index: true },
    /** Job roles for `staff` (several allowed); they decide permissions (common/permissions.ts). */
    staffRoles: { type: [String], enum: STAFF_ROLE_KEYS, default: undefined },
    language: { type: String, enum: ['en', 'hi'], default: 'en' },
    /** Promotional email / SMS. Order updates and sign-in codes are always sent. */
    offers: { type: Boolean, default: true },
    addresses: { type: [addressSchema], default: [] },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    /** When the customer last opened their Updates page; newer updates count as unread. */
    updatesSeenAt: Date,
  },
  { timestamps: true },
);

userSchema.set('toJSON', {
  versionKey: false,
  transform: (_doc, ret: Record<string, unknown>) => {
    delete ret.passwordHash;
    return ret;
  },
});

export type User = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<User>;
export const UserModel = model('User', userSchema);
