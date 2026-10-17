import { Router, type Response } from 'express';
import { z } from 'zod';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { OrderModel, TERMINAL_STATUSES } from '@/modules/orders/order.model';
import { round2 } from '@/modules/pricing/pricing.service';
import { UserModel } from '@/modules/users/user.model';
import { sendCsv, type Column } from './csv';

export const adminReportsRouter = Router();

const TZ = 'Asia/Kolkata';
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const rangeQuery = z.object({
  from: day.optional(),
  to: day.optional(),
  groupBy: z.enum(['day', 'month']).default('day'),
  format: z.enum(['json', 'csv']).default('json'),
});
type RangeQuery = z.infer<typeof rangeQuery>;

const istDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });

/** Inclusive IST date range → [start, end) instants. Defaults to the last 30 days. */
function resolveRange(q: RangeQuery) {
  const today = istDay(new Date());
  const to = q.to ?? today;
  const from = q.from ?? istDay(new Date(new Date(`${to}T00:00:00+05:30`).getTime() - 29 * 86_400_000));
  const start = new Date(`${from}T00:00:00+05:30`);
  const end = new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000);
  return { from, to, start, end };
}

/** Responds with JSON for the screen, or the same rows as a CSV download. */
function respond<T>(res: Response, q: RangeQuery, name: string, range: { from: string; to: string } | null, rows: T[], columns: Column<T>[], summary?: Record<string, number>) {
  if (q.format === 'csv') {
    sendCsv(res, `${name}${range ? `_${range.from}_to_${range.to}` : ''}.csv`, rows, columns);
    return;
  }
  res.json({
    range,
    columns: columns.map(({ key, label }) => ({ key, label })),
    rows: rows.map((r) => Object.fromEntries(columns.map((c) => [c.key, c.value(r) ?? null]))),
    summary,
  });
}

const sumBy = <T>(rows: T[], f: (r: T) => number) => round2(rows.reduce((s, r) => s + (f(r) || 0), 0));

// ── Sales by day / month ────────────────────────────────────────────────────
adminReportsRouter.get('/sales', async (req, res) => {
  const q = rangeQuery.parse(req.query);
  const range = resolveRange(q);
  const format = q.groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
  const rows = await OrderModel.aggregate<{
    _id: string; orders: number; revenue: number; collected: number; tax: number; retail: number; institution: number; walkIn: number;
  }>([
    { $match: { status: { $nin: ['cancelled', 'awaiting_payment', 'quote_pending'] }, createdAt: { $gte: range.start, $lt: range.end } } },
    {
      $group: {
        _id: { $dateToString: { format, date: '$createdAt', timezone: TZ } },
        orders: { $sum: 1 },
        revenue: { $sum: '$totals.total' },
        collected: { $sum: { $subtract: ['$payment.amountPaid', { $ifNull: ['$payment.amountRefunded', 0] }] } },
        tax: { $sum: '$totals.tax' },
        retail: { $sum: { $cond: [{ $eq: ['$audience', 'retail'] }, '$totals.total', 0] } },
        institution: { $sum: { $cond: [{ $eq: ['$audience', 'institution'] }, '$totals.total', 0] } },
        walkIn: { $sum: { $cond: [{ $eq: ['$source', 'walk_in'] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  type Row = (typeof rows)[number];
  respond<Row>(res, q, `sales-${q.groupBy}`, range, rows, [
    { key: 'period', label: q.groupBy === 'month' ? 'Month' : 'Date', value: (r) => r._id },
    { key: 'orders', label: 'Orders', value: (r) => r.orders },
    { key: 'walkIn', label: 'Walk-in orders', value: (r) => r.walkIn },
    { key: 'retail', label: 'Individuals (Rs)', value: (r) => round2(r.retail) },
    { key: 'institution', label: 'Institutions (Rs)', value: (r) => round2(r.institution) },
    { key: 'revenue', label: 'Total sales (Rs)', value: (r) => round2(r.revenue) },
    { key: 'tax', label: 'GST included (Rs)', value: (r) => round2(r.tax) },
    { key: 'collected', label: 'Collected (Rs)', value: (r) => round2(r.collected) },
    { key: 'due', label: 'Due (Rs)', value: (r) => round2(r.revenue - r.collected) },
  ], {
    orders: sumBy(rows, (r) => r.orders),
    revenue: sumBy(rows, (r) => r.revenue),
    collected: sumBy(rows, (r) => r.collected),
    tax: sumBy(rows, (r) => r.tax),
  });
});

// ── Top products ────────────────────────────────────────────────────────────
adminReportsRouter.get('/products', async (req, res) => {
  const q = rangeQuery.parse(req.query);
  const range = resolveRange(q);
  const rows = await OrderModel.aggregate<{ _id: unknown; name: { en: string }; orders: number; units: number; revenue: number }>([
    { $match: { status: { $nin: ['cancelled', 'awaiting_payment', 'quote_pending'] }, createdAt: { $gte: range.start, $lt: range.end } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.productName' },
        orders: { $sum: 1 },
        units: { $sum: '$items.units' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
    { $sort: { revenue: -1 } },
  ]);
  const total = sumBy(rows, (r) => r.revenue) || 1;
  type Row = (typeof rows)[number];
  respond<Row>(res, q, 'top-products', range, rows, [
    { key: 'product', label: 'Product', value: (r) => r.name?.en },
    { key: 'orders', label: 'Order lines', value: (r) => r.orders },
    { key: 'units', label: 'Units', value: (r) => r.units },
    { key: 'revenue', label: 'Sales (Rs)', value: (r) => round2(r.revenue) },
    { key: 'share', label: 'Share %', value: (r) => round2((r.revenue / total) * 100) },
  ], { revenue: sumBy(rows, (r) => r.revenue), units: sumBy(rows, (r) => r.units) });
});

// ── Pending payments (not date-bound: everything still owed) ────────────────
adminReportsRouter.get('/pending-payments', async (req, res) => {
  const q = rangeQuery.parse(req.query);
  const orders = await OrderModel.find({
    status: { $nin: ['cancelled', 'quote_pending', 'awaiting_payment'] },
    'payment.status': { $in: ['pending', 'partial'] },
  })
    .select('orderNumber contact audience source status totals payment createdAt institution')
    .populate('institution', 'name')
    .sort({ createdAt: 1 })
    .lean();
  const now = Date.now();
  type Row = (typeof orders)[number];
  const due = (o: Row) => round2(o.totals.total - (o.payment?.amountPaid ?? 0) + (o.payment?.amountRefunded ?? 0));
  const rows = orders.filter((o) => due(o) > 0.009);
  respond<Row>(res, q, 'pending-payments', null, rows, [
    { key: 'orderNumber', label: 'Order', value: (o) => o.orderNumber },
    { key: 'id', label: 'Id', value: (o) => String(o._id) },
    { key: 'date', label: 'Order date', value: (o) => istDay(o.createdAt) },
    { key: 'ageDays', label: 'Days open', value: (o) => Math.floor((now - o.createdAt.getTime()) / 86_400_000) },
    { key: 'customer', label: 'Customer', value: (o) => (o.institution as { name?: string } | null)?.name ?? o.contact?.name },
    { key: 'phone', label: 'Phone', value: (o) => o.contact?.phone },
    { key: 'status', label: 'Order status', value: (o) => o.status },
    { key: 'method', label: 'Pay method', value: (o) => o.payment?.method },
    { key: 'total', label: 'Total (Rs)', value: (o) => o.totals.total },
    { key: 'paid', label: 'Paid (Rs)', value: (o) => o.payment?.amountPaid ?? 0 },
    { key: 'due', label: 'Due (Rs)', value: due },
  ], { orders: rows.length, due: sumBy(rows, due) });
});

// ── Per-institution totals ──────────────────────────────────────────────────
adminReportsRouter.get('/institutions', async (req, res) => {
  const q = rangeQuery.parse(req.query);
  const range = resolveRange(q);
  const agg = await OrderModel.aggregate<{ _id: unknown; orders: number; revenue: number; paid: number; lastOrder: Date }>([
    {
      $match: {
        institution: { $exists: true, $ne: null },
        status: { $ne: 'cancelled' },
        createdAt: { $gte: range.start, $lt: range.end },
      },
    },
    {
      $group: {
        _id: '$institution',
        orders: { $sum: 1 },
        revenue: { $sum: '$totals.total' },
        paid: { $sum: { $subtract: ['$payment.amountPaid', { $ifNull: ['$payment.amountRefunded', 0] }] } },
        lastOrder: { $max: '$createdAt' },
      },
    },
    { $sort: { revenue: -1 } },
  ]);
  const institutions = await InstitutionModel.find({ _id: { $in: agg.map((a) => a._id) } })
    .select('name type status phone')
    .lean();
  const byId = new Map(institutions.map((i) => [String(i._id), i]));
  const rows = agg.map((a) => ({ ...a, inst: byId.get(String(a._id)) }));
  type Row = (typeof rows)[number];
  respond<Row>(res, q, 'institutions', range, rows, [
    { key: 'name', label: 'Institution', value: (r) => r.inst?.name ?? 'Deleted' },
    { key: 'id', label: 'Id', value: (r) => String(r._id) },
    { key: 'type', label: 'Type', value: (r) => r.inst?.type },
    { key: 'phone', label: 'Phone', value: (r) => r.inst?.phone },
    { key: 'orders', label: 'Orders', value: (r) => r.orders },
    { key: 'revenue', label: 'Total (Rs)', value: (r) => round2(r.revenue) },
    { key: 'paid', label: 'Paid (Rs)', value: (r) => round2(r.paid) },
    { key: 'due', label: 'Due (Rs)', value: (r) => round2(r.revenue - r.paid) },
    { key: 'lastOrder', label: 'Last order', value: (r) => istDay(r.lastOrder) },
  ], { revenue: sumBy(rows, (r) => r.revenue), paid: sumBy(rows, (r) => r.paid) });
});

// ── Staff workload ──────────────────────────────────────────────────────────
adminReportsRouter.get('/staff', async (req, res) => {
  const q = rangeQuery.parse(req.query);
  const range = resolveRange(q);
  const [handled, open, deliveries] = await Promise.all([
    OrderModel.aggregate<{ _id: unknown; orders: number; revenue: number; completed: number }>([
      { $match: { assignedTo: { $ne: null }, status: { $ne: 'cancelled' }, createdAt: { $gte: range.start, $lt: range.end } } },
      {
        $group: {
          _id: '$assignedTo',
          orders: { $sum: 1 },
          revenue: { $sum: '$totals.total' },
          completed: { $sum: { $cond: [{ $in: ['$status', TERMINAL_STATUSES] }, 1, 0] } },
        },
      },
    ]),
    OrderModel.aggregate<{ _id: unknown; open: number }>([
      { $match: { assignedTo: { $ne: null }, status: { $nin: TERMINAL_STATUSES } } },
      { $group: { _id: '$assignedTo', open: { $sum: 1 } } },
    ]),
    OrderModel.aggregate<{ _id: unknown; delivered: number; pending: number }>([
      { $match: { deliveryPerson: { $ne: null }, createdAt: { $gte: range.start, $lt: range.end } } },
      {
        $group: {
          _id: '$deliveryPerson',
          delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $in: ['$status', TERMINAL_STATUSES] }, 0, 1] } },
        },
      },
    ]),
  ]);
  const ids = [...new Set([...handled, ...open, ...deliveries].map((r) => String(r._id)))];
  const staff = await UserModel.find({ _id: { $in: ids } }).select('name role isActive').lean();
  const pick = <T extends { _id: unknown }>(list: T[], id: string) => list.find((r) => String(r._id) === id);
  const rows = staff.map((s) => {
    const id = String(s._id);
    const h = pick(handled, id);
    const d = pick(deliveries, id);
    return {
      name: s.name,
      role: s.role,
      orders: h?.orders ?? 0,
      completed: h?.completed ?? 0,
      open: pick(open, id)?.open ?? 0,
      revenue: round2(h?.revenue ?? 0),
      delivered: d?.delivered ?? 0,
      deliveriesPending: d?.pending ?? 0,
    };
  });
  rows.sort((a, b) => b.orders + b.delivered - (a.orders + a.delivered));
  type Row = (typeof rows)[number];
  respond<Row>(res, q, 'staff-workload', range, rows, [
    { key: 'name', label: 'Staff', value: (r) => r.name },
    { key: 'role', label: 'Role', value: (r) => r.role },
    { key: 'orders', label: 'Orders handled', value: (r) => r.orders },
    { key: 'completed', label: 'Completed', value: (r) => r.completed },
    { key: 'open', label: 'Open now', value: (r) => r.open },
    { key: 'revenue', label: 'Order value (Rs)', value: (r) => r.revenue },
    { key: 'delivered', label: 'Delivered', value: (r) => r.delivered },
    { key: 'deliveriesPending', label: 'Deliveries pending', value: (r) => r.deliveriesPending },
  ]);
});
