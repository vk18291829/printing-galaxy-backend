import { Router } from 'express';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { LOW_STOCK_FILTER, MaterialModel } from '@/modules/inventory/material.model';
import { OrderModel, TERMINAL_STATUSES } from '@/modules/orders/order.model';
import { ReviewModel } from '@/modules/reviews/review.model';

export const dashboardRouter = Router();

function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

dashboardRouter.get('/', async (_req, res) => {
  const today = startOfDay();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const last14 = new Date(today.getTime() - 13 * 86_400_000);
  const notCancelled = { status: { $ne: 'cancelled' } };

  const sumRange = (from: Date) =>
    OrderModel.aggregate<{ revenue: number; collected: number; orders: number }>([
      { $match: { ...notCancelled, createdAt: { $gte: from } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$totals.total' },
          collected: { $sum: '$payment.amountPaid' },
          orders: { $sum: 1 },
        },
      },
    ]);

  const [todayAgg, monthAgg, byStatus, pendingPayments, pendingInstitutions, daily, topProducts, recent, byAudience, lowStock, pendingReviews] =
    await Promise.all([
      sumRange(today),
      sumRange(monthStart),
      OrderModel.aggregate<{ _id: string; count: number }>([
        { $match: { status: { $nin: TERMINAL_STATUSES } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      OrderModel.aggregate<{ due: number; orders: number }>([
        { $match: { ...notCancelled, 'payment.status': { $in: ['pending', 'partial'] } } },
        {
          $group: {
            _id: null,
            due: { $sum: { $subtract: ['$totals.total', '$payment.amountPaid'] } },
            orders: { $sum: 1 },
          },
        },
      ]),
      InstitutionModel.countDocuments({ status: 'pending' }),
      OrderModel.aggregate<{ _id: string; revenue: number; orders: number }>([
        { $match: { ...notCancelled, createdAt: { $gte: last14 } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
            revenue: { $sum: '$totals.total' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      OrderModel.aggregate<{ _id: unknown; name: { en: string }; revenue: number; orders: number }>([
        { $match: { ...notCancelled, createdAt: { $gte: monthStart } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product',
            name: { $first: '$items.productName' },
            revenue: { $sum: '$items.lineTotal' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
      ]),
      OrderModel.find()
        .select('orderNumber contact status totals payment audience source createdAt')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      OrderModel.aggregate<{ _id: string; revenue: number; orders: number }>([
        { $match: { ...notCancelled, createdAt: { $gte: monthStart } } },
        { $group: { _id: '$audience', revenue: { $sum: '$totals.total' }, orders: { $sum: 1 } } },
      ]),
      MaterialModel.find(LOW_STOCK_FILTER)
        .select('name unit quantity lowStockThreshold reorderQuantity')
        .sort({ quantity: 1 })
        .limit(10)
        .lean(),
      ReviewModel.countDocuments({ status: 'pending' }),
    ]);

  // Fill missing days so the chart has a continuous x-axis.
  const dailyMap = new Map(daily.map((d) => [d._id, d]));
  const series = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(last14.getTime() + i * 86_400_000);
    const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return { date: key, revenue: dailyMap.get(key)?.revenue ?? 0, orders: dailyMap.get(key)?.orders ?? 0 };
  });

  const empty = { revenue: 0, collected: 0, orders: 0 };
  res.json({
    today: todayAgg[0] ?? empty,
    month: monthAgg[0] ?? empty,
    openByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
    pendingPayments: pendingPayments[0] ?? { due: 0, orders: 0 },
    pendingInstitutions,
    pendingReviews,
    daily: series,
    topProducts,
    byAudience: Object.fromEntries(byAudience.map((a) => [a._id, { revenue: a.revenue, orders: a.orders }])),
    recentOrders: recent,
    lowStock,
  });
});
