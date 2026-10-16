import type { Institution, LocalizedString, Order, OrderStatus, Paginated, PublicSettings, User } from './api';

export interface AdminOrderListItem extends Omit<Order, 'statusHistory'> {
  assignedTo?: { _id: string; name: string };
  internalNote?: string;
}

export interface AdminOrderList extends Paginated<AdminOrderListItem> {
  statusCounts: Partial<Record<OrderStatus, number>>;
}

export interface PaymentRecord {
  _id: string;
  provider: 'razorpay' | 'cash' | 'upi_counter';
  amount: number;
  status: 'created' | 'captured' | 'failed' | 'refunded';
  razorpayPaymentId?: string;
  note?: string;
  createdAt: string;
}

export interface AdminOrder extends Order {
  internalNote?: string;
  cancelReason?: string;
  assignedTo?: { _id: string; name: string; role: string };
  deliveryPerson?: { _id: string; name: string; role: string };
  institution?: Pick<Institution, '_id' | 'name' | 'type' | 'status' | 'phone' | 'email'>;
  payments: PaymentRecord[];
}

export interface DashboardData {
  today: { revenue: number; collected: number; orders: number };
  month: { revenue: number; collected: number; orders: number };
  openByStatus: Partial<Record<OrderStatus, number>>;
  pendingPayments: { due: number; orders: number };
  pendingInstitutions: number;
  pendingReviews?: number;
  daily: { date: string; revenue: number; orders: number }[];
  topProducts: { _id: string; name: LocalizedString; revenue: number; orders: number }[];
  byAudience: Partial<Record<'retail' | 'institution', { revenue: number; orders: number }>>;
  recentOrders: AdminOrderListItem[];
  lowStock: Pick<Material, '_id' | 'name' | 'unit' | 'quantity' | 'lowStockThreshold' | 'reorderQuantity'>[];
}

export type MaterialUnit = 'sheets' | 'cards' | 'pcs' | 'rolls' | 'packs' | 'ml' | 'kg' | 'm';
export type MovementReason = 'purchase' | 'usage' | 'wastage' | 'correction';

export interface Material {
  _id: string;
  name: string;
  sku?: string;
  unit: MaterialUnit;
  quantity: number;
  lowStockThreshold: number;
  reorderQuantity?: number;
  supplier?: string;
  notes?: string;
  isActive: boolean;
  low?: boolean;
  updatedAt: string;
}

export interface StockMovement {
  _id: string;
  delta: number;
  balance: number;
  reason: MovementReason;
  note?: string;
  by?: { _id: string; name: string };
  createdAt: string;
}

export interface ReportData {
  range: { from: string; to: string } | null;
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
  summary?: Record<string, number>;
}

export type CardKind = 'student_id' | 'teacher_id' | 'out_pass' | 'fee_card';
export type BulkStatus = 'queued' | 'validating' | 'needs_fixes' | 'generating' | 'ready' | 'ordered' | 'failed';

export interface BulkIssue {
  row?: number;
  field?: string;
  message: string;
}

export interface BulkJobListItem {
  _id: string;
  kind: CardKind;
  status: BulkStatus;
  institution?: { _id: string; name: string };
  template?: { _id: string; name: string; kind: CardKind };
  order?: { _id: string; orderNumber: string; status: OrderStatus };
  report: { rows: number; validRows: number; photosInZip: number; photosMatched: number };
  output?: { file?: string | { _id: string; originalName: string; size: number; status: string }; sheets?: number; cards?: number; generatedAt?: string };
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BulkJobDetail extends Omit<BulkJobListItem, 'template' | 'report'> {
  institution?: { _id: string; name: string; phone: string; email: string; status: string };
  template?: { _id: string; name: string; kind: CardKind; orientation: string; colors: Record<string, string>; logoUrl?: string; headerText?: string };
  product?: { _id: string; name: LocalizedString; slug: string };
  report: BulkJobListItem['report'] & { columns: string[]; ignoredColumns: string[]; errors: BulkIssue[]; warnings: BulkIssue[] };
  dataFile?: { _id: string; originalName: string; size: number; status: string };
  photosFile?: { _id: string; originalName: string; size: number; status: string };
  preview: { row: number; data: Record<string, string>; photo?: string }[];
  attempts: number;
}

export interface DeliveryOrder {
  _id: string;
  orderNumber: string;
  status: OrderStatus;
  contact: { name?: string; phone?: string };
  fulfilment: Order['fulfilment'];
  totals: Order['totals'];
  payment: Order['payment'];
  items: { productName: LocalizedString; quantity: number; units: number; unit: string }[];
  customerNote?: string;
  deliveryPerson?: { _id: string; name: string };
  statusHistory?: { status: OrderStatus; note?: string; at: string }[];
  createdAt: string;
}

export interface AdminInstitutionList extends Paginated<Institution> {
  statusCounts: Partial<Record<Institution['status'], number>>;
}

export interface AdminInstitutionDetail extends Institution {
  stats: { orders: number; revenue: number };
  recentOrders: Pick<Order, '_id' | 'orderNumber' | 'status' | 'totals' | 'payment' | 'createdAt'>[];
  reviewedAt?: string;
}

export interface Customer extends User {
  orders: number;
  spent: number;
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface StaffMember extends User {
  isActive: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface AuditEntry {
  _id: string;
  actor?: { id?: string; kind: string; role?: string };
  actorName?: string;
  action: string;
  entity: string;
  entityId?: string;
  summary?: string;
  changes?: unknown;
  createdAt: string;
}

export interface Settings extends Omit<PublicSettings, 'shop' | 'tax'> {
  _id: string;
  shop: PublicSettings['shop'] & { state: string };
  tax: PublicSettings['tax'] & { sacCode: string };
  sensitiveRetentionDays: number;
}
