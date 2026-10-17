import { Router, type Request } from 'express';
import { authenticate } from '@/middleware/auth';
import { InstitutionModel } from '@/modules/institutions/institution.model';
import { CampaignModel } from '@/modules/marketing/promo.model';
import { OrderModel } from '@/modules/orders/order.model';
import { PaymentModel } from '@/modules/payments/payment.model';
import { UserModel } from './user.model';

/** The customer's Updates page: order progress, refunds and offers from the last 90 days. */
export const updatesRouter = Router();
updatesRouter.use(authenticate);

const WINDOW_MS = 90 * 86_400_000;
const MAX_ITEMS = 60;

type Update =
  | { id: string; kind: 'order'; status: string; orderId: string; orderNumber: string; at: Date }
  | { id: string; kind: 'refund'; amount: number; done: boolean; orderId: string; orderNumber: string; at: Date }
  | { id: string; kind: 'offer'; title?: string; text: string; at: Date };

async function account(req: Request) {
  const auth = req.auth!;
  return auth.kind === 'institution'
    ? { owner: { institution: auth.id }, me: await InstitutionModel.findById(auth.id).select('updatesSeenAt createdAt').lean(), offers: false }
    : {
        owner: { customer: auth.id },
        me: await UserModel.findById(auth.id).select('updatesSeenAt createdAt offers').lean(),
        offers: true,
      };
}

updatesRouter.get('/', async (req, res) => {
  const { owner, me, offers } = await account(req);
  const since = new Date(Date.now() - WINDOW_MS);
  const orders = await OrderModel.find({ ...owner, updatedAt: { $gte: since } })
    .select('orderNumber statusHistory')
    .sort({ updatedAt: -1 })
    .limit(30)
    .lean();
  const numbers = new Map(orders.map((o) => [String(o._id), o.orderNumber]));

  const items: Update[] = orders.flatMap((o) =>
    // Status changes only: history notes can hold staff-only details.
    o.statusHistory
      .filter((h) => h.at && h.at >= since)
      .map((h) => ({ id: `${o._id}:${h.status}:${h.at!.getTime()}`, kind: 'order' as const, status: h.status, orderId: String(o._id), orderNumber: o.orderNumber, at: h.at! })),
  );

  const refunds = await PaymentModel.find({ order: { $in: orders.map((o) => o._id) }, kind: 'refund', createdAt: { $gte: since } })
    .select('order amount status createdAt')
    .lean();
  for (const r of refunds) {
    items.push({ id: String(r._id), kind: 'refund', amount: r.amount, done: r.status === 'refunded', orderId: String(r.order), orderNumber: numbers.get(String(r.order)) ?? '', at: r.createdAt });
  }

  const userMe = me as { offers?: boolean; createdAt?: Date } | null;
  if (offers && userMe?.offers !== false) {
    const from = userMe?.createdAt && userMe.createdAt > since ? userMe.createdAt : since;
    const campaigns = await CampaignModel.find({ status: { $in: ['sent', 'stopped'] }, createdAt: { $gte: from } })
      .select('title text channel createdAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    for (const c of campaigns) items.push({ id: String(c._id), kind: 'offer', title: c.channel === 'email' ? c.title : undefined, text: c.text, at: c.createdAt });
  }

  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  const list = items.slice(0, MAX_ITEMS);
  const seenAt = me?.updatesSeenAt ?? null;
  res.json({ items: list, unread: list.filter((i) => !seenAt || i.at > seenAt).length, seenAt });
});

updatesRouter.post('/seen', async (req, res) => {
  const auth = req.auth!;
  const Model = auth.kind === 'institution' ? InstitutionModel : UserModel;
  await (Model as typeof UserModel).updateOne({ _id: auth.id }, { $set: { updatesSeenAt: new Date() } });
  res.status(204).end();
});
