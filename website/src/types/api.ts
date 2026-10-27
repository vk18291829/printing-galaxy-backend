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
  category: Pick<Category, '_id' | 'name' | 'slug' | 'icon' | 'audiences'>;
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
  tags?: string[];
  /** Approved-review average; absent on products created before reviews existed. */
  rating?: { average: number; count: number };
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
  /** Promotional SMS; order updates are always sent. */
  offers?: boolean;
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
  | 'quote_sent'
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
  /** A size typed in by the customer instead of a listed one. */
  customSize?: CustomSize;
  files: (UploadedFile | string)[];
  proofs: Proof[];
}

export type SizeUnit = 'mm' | 'cm' | 'in';
export interface CustomSize {
  width: number;
  height: number;
  unit: SizeUnit;
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
  /** The customer's purchase order / reference number. */
  reference?: string;
  quote?: { requested?: boolean; sentAt?: string; validUntil?: string; acceptedAt?: string };
  cancelReason?: string;
  /** Pickup / delivery code; only sent while the customer needs it. */
  handoverCode?: string;
  refunds?: { _id: string; amount: number; status: 'refund_pending' | 'refunded' | 'failed'; provider: string; createdAt: string }[];
  invoice?: { number: string; issuedAt: string };
  createdAt: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export type SocialNetwork = 'instagram' | 'facebook' | 'youtube' | 'x' | 'linkedin';

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
  /** Full profile URLs; empty = not shown. Missing on an API older than this field. */
  social?: Partial<Record<SocialNetwork, string>>;
  tax: { enabled: boolean; rate: number; pricesIncludeTax: boolean };
  delivery: { enabled: boolean; fee: number; freeAbove: number };
  payments: { onlineEnabled: boolean; counterEnabled: boolean; onlineTimeoutMinutes?: number };
  /** How customers sign in and get order updates. */
  messaging?: 'email' | 'sms';
}

export type BannerKind = 'hero' | 'promo' | 'feature' | 'offer';
export type BannerTheme = 'blue' | 'magenta' | 'sunset' | 'mint' | 'dark';

export interface Banner {
  _id: string;
  kind: BannerKind;
  title: LocalizedString;
  subtitle?: LocalizedString;
  ctaLabel?: LocalizedString;
  link?: string;
  imageUrl?: string;
  theme: BannerTheme;
  badge?: string;
  couponCode?: string;
}

export type BannerGroups = Record<BannerKind, Banner[]>;

export interface Review {
  _id: string;
  authorName: string;
  rating: number;
  title?: string;
  comment?: string;
  verifiedPurchase: boolean;
  reply?: { text?: string; at?: string };
  status?: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export interface RatingSummary {
  average: number;
  count: number;
  breakdown: [number, number, number, number, number];
}

export interface ProductReviews {
  summary: RatingSummary;
  reviews: Review[];
  mine: Review | null;
}

export type ReviewHighlight = Review & { product: Pick<Product, '_id' | 'name' | 'slug' | 'images' | 'icon'> };
