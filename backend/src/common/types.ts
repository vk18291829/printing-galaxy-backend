import { Schema } from 'mongoose';

export const AUDIENCES = ['retail', 'institution'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const USER_ROLES = ['customer', 'staff', 'admin', 'delivery'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const STAFF_ROLES: UserRole[] = ['staff', 'admin', 'delivery'];

export type PrincipalKind = 'user' | 'institution';

export interface AuthContext {
  id: string;
  kind: PrincipalKind;
  role: UserRole | 'institution';
}

export interface LocalizedString {
  en: string;
  hi?: string;
}

export const localizedSchema = new Schema<LocalizedString>(
  {
    // Non-empty names are enforced by the Zod input schemas; descriptions may be blank.
    en: { type: String, trim: true, default: '' },
    hi: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

export const addressSchema = new Schema(
  {
    label: { type: String, trim: true },
    name: { type: String, trim: true },
    phone: { type: String, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true, trim: true },
  },
  { _id: false },
);

export interface Address {
  label?: string;
  name?: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
}
