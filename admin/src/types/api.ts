export interface LocalizedString {
  en: string;
  hi?: string;
}

export type Audience = 'retail' | 'institution';
export type ProductUnit = 'page' | 'piece' | 'card' | 'copy' | 'set' | 'photo';
export type ProductWorkflow = 'standard' | 'design' | 'identity' | 'quote';

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

export interface Category {
  _id: string;
  name: LocalizedString;
  slug: string;
  description: LocalizedString;
  icon: string;
  imageUrl?: string;
  audiences: Audience[];
  productCount?: number;
}

export interface OptionValue {
  value: string;
  label: LocalizedString;
  unitDelta: number;
  fixedFee: number;
  minCopies?: number;
  isDefault: boolean;
}

export interface ProductOption {
  key: string;
  label: LocalizedString;
  required: boolean;
  values: OptionValue[];
}

export interface PriceTier {
  minQty: number;
  unitPrice: number;
}

export interface PriceBook {
  enabled: boolean;
  minQty: number;
  tiers: PriceTier[];
}

export interface Product {
  _id: string;
  name: LocalizedString;
  slug: string;
  category: Pick<Category, '_id' | 'name' | 'slug' | 'icon'>;
  shortDescription: LocalizedString;
  description: LocalizedString;
  images: string[];
  icon: string;
  unit: ProductUnit;
  workflow: ProductWorkflow;
  specs: string[];
  requiresUpload: boolean;
  acceptedFileTypes: string[];
  uploadHint: LocalizedString;
  sensitive: boolean;
  options: ProductOption[];
  pricing: Record<Audience, PriceBook>;
  leadTimeDays: number;
  isFeatured: boolean;
}

export type QuoteErrorCode =
  | 'NOT_AVAILABLE'
  | 'OPTION_REQUIRED'
  | 'OPTION_INVALID'
  | 'MIN_QTY'
  | 'MIN_COPIES'
  | 'PAGE_COUNT_REQUIRED';

export interface SelectedOption {
  key: string;
  label: LocalizedString;
  value: string;
  valueLabel: LocalizedString;
  unitDelta: number;
  fixedFee: number;
}

export interface Quote {
  audience: Audience;
  unit: ProductUnit;
  units: number;
  quantity: number;
  copies: number;
  pageCount: number | null;
  minQty: number;
  minCopies: number;
  tierUnitPrice: number;
  optionUnitDelta: number;
  unitPrice: number;
  fixedFeePerCopy: number;
  fixedFees: number;
  discountPercent: number;
  discount: number;
  subtotal: number;
  nextTier: PriceTier | null;
  selectedOptions: SelectedOption[];
  requiresQuote: boolean;
  valid: boolean;
  errors: { code: QuoteErrorCode; message: string; params?: Record<string, string | number> }[];
}

export interface User {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  role: 'customer' | 'staff' | 'admin' | 'delivery';
  language: 'en' | 'hi';
  addresses: Address[];
}

export type InstitutionType = 'school' | 'college' | 'coaching' | 'enterprise';
export type InstitutionStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface Institution {
  _id: string;
  name: string;
  type: InstitutionType;
  contactName: string;
  designation?: string;
  email: string;
  phone: string;
  address: Address;
  gstin?: string;
  size?: number;
  logoUrl?: string;
  status: InstitutionStatus;
  statusReason?: string;
  extraDiscountPercent: number;
  createdAt: string;
}

export type Principal = { kind: 'user'; user: User } | { kind: 'institution'; institution: Institution };
export type SessionResponse = Principal & { accessToken: string };

export interface UploadedFile {
  _id: string;
  originalName: string;
  mimeType: string;
  size: number;
  pageCount?: number;
  sensitive?: boolean;
  status?: string;
  readable?: boolean;
  publicUrl?: string;
}

export type OrderStatus =
  | 'quote_pending'
  | 'awaiting_payment'
  | 'received'
  | 'proof_sent'
  | 'approved'
  | 'printing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'picked_up'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded' | 'failed';

export interface Proof {
  _id: string;
  file: UploadedFile | string;
  message?: string;
  status: 'pending' | 'approved' | 'changes_requested';
  customerComment?: string;
  createdAt: string;
}

export interface OrderItem {
  _id: string;
  product: string;
  productName: LocalizedString;
  productSlug: string;
  workflow: ProductWorkflow;
  unit: ProductUnit;
  options: SelectedOption[];
  quantity: number;
  copies: number;
  pageCount?: number;
  units: number;
  unitPrice: number;
  fixedFees: number;
  discount: number;
  lineTotal: number;
  notes?: string;
  files: (UploadedFile | string)[];
  proofs: Proof[];
}

export interface Order {
  _id: string;
  orderNumber: string;
  audience: Audience;
  source: 'online' | 'walk_in';
  items: OrderItem[];
  status: OrderStatus;
  statusHistory?: { status: OrderStatus; note?: string; at: string }[];
  fulfilment: { method: 'pickup' | 'delivery'; address?: Address };
  totals: { subtotal: number; deliveryFee: number; taxRate: number; tax: number; total: number };
  payment: { method: 'online' | 'counter'; status: PaymentStatus; amountPaid: number; amountRefunded?: number; dueBy?: string };
  contact: { name?: string; phone?: string; email?: string };
  customerNote?: string;
  invoice?: { number: string; issuedAt: string };
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

/** Full profile URLs; an empty string hides that icon on the website. */
export interface SocialLinks {
  instagram: string;
  facebook: string;
  youtube: string;
  x: string;
  linkedin: string;
}

export interface PublicSettings {
  shop: {
    name: string;
    phone: string;
    whatsapp: string;
    email: string;
    address: string;
    mapUrl: string;
    hours: string;
    gstin: string;
  };
  social: SocialLinks;
  tax: { enabled: boolean; rate: number; pricesIncludeTax: boolean };
  delivery: { enabled: boolean; fee: number; freeAbove: number };
  payments: { onlineEnabled: boolean; counterEnabled: boolean; onlineTimeoutMinutes?: number; quotePaymentDays?: number };
}
