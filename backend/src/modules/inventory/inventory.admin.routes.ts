import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '@/common/errors';
import { objectId } from '@/common/validation';
import { requireAdmin } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { audit } from '@/modules/audit/audit.model';
import { notifications } from '@/modules/notifications/notification.service';
import { getSettings } from '@/modules/settings/settings.model';
import { MATERIAL_UNITS, MaterialModel, MOVEMENT_REASONS, StockMovementModel } from './material.model';

export const adminInventoryRouter = Router();

const idParams = z.object({ id: objectId });

const materialInput = z.object({
  name: z.string().trim().min(1).max(100),
  sku: z.string().trim().max(40).optional(),
  unit: z.enum(MATERIAL_UNITS),
  lowStockThreshold: z.coerce.number().min(0),
  reorderQuantity: z.coerce.number().min(0).optional(),
  supplier: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional(),
});

const movementInput = z.object({
  /** Positive adds stock, negative uses it up. For "correction" this is the new counted total. */
  quantity: z.coerce.number().refine((v) => v !== 0, 'Enter a quantity'),
  reason: z.enum(MOVEMENT_REASONS),
  note: z.string().trim().max(300).optional(),
});

/** Sends one alert when stock drops to the threshold; re-arms once restocked above it. */
async function checkLowStock(materialId: string) {
  const m = await MaterialModel.findById(materialId);
  if (!m || !m.isActive || m.lowStockThreshold <= 0) return;
  const low = m.quantity <= m.lowStockThreshold;
  if (low && !m.lowStockAlertedAt) {
    m.lowStockAlertedAt = new Date();
    await m.save();
    const settings = await getSettings();
    void notifications.staffAlert(
      settings.shop.whatsapp || settings.shop.phone,
      'low_stock',
      `${m.name} is low: ${m.quantity} ${m.unit} left (alert at ${m.lowStockThreshold}).${m.reorderQuantity ? ` Reorder ${m.reorderQuantity} ${m.unit}.` : ''}`,
    );
  } else if (!low && m.lowStockAlertedAt) {
    m.lowStockAlertedAt = undefined;
    await m.save();
  }
}

export async function recordMovement(
  req: Request | null,
  materialId: string,
  input: z.infer<typeof movementInput> & { order?: string },
) {
  const current = await MaterialModel.findById(materialId).select('quantity name unit').lean();
  if (!current) throw ApiError.notFound('Material');
  const delta =
    input.reason === 'correction'
      ? input.quantity - current.quantity
      : input.reason === 'purchase'
        ? Math.abs(input.quantity)
        : -Math.abs(input.quantity);

  // $inc keeps concurrent counter updates correct.
  const updated = await MaterialModel.findByIdAndUpdate(materialId, { $inc: { quantity: delta } }, { new: true });
  if (!updated) throw ApiError.notFound('Material');
  const movement = await StockMovementModel.create({
    material: updated._id,
    delta,
    balance: updated.quantity,
    reason: input.reason,
    note: input.note,
    order: input.order,
    by: req?.auth?.id,
  });
  audit(req, {
    action: 'inventory.movement',
    entity: 'Material',
    entityId: updated._id,
    summary: `${updated.name}: ${delta > 0 ? '+' : ''}${delta} ${updated.unit} (${input.reason}) → ${updated.quantity}`,
  });
  await checkLowStock(String(updated._id));
  return { material: updated, movement };
}

adminInventoryRouter.get('/', async (_req, res) => {
  const items = await MaterialModel.find().sort({ isActive: -1, name: 1 }).lean();
  res.json(
    items.map((m) => ({
      ...m,
      low: m.isActive && m.lowStockThreshold > 0 && m.quantity <= m.lowStockThreshold,
    })),
  );
});

adminInventoryRouter.post('/', requireAdmin, validate({ body: materialInput.extend({ quantity: z.coerce.number().min(0).default(0) }) }), async (req, res) => {
  const material = await MaterialModel.create(req.body);
  audit(req, { action: 'inventory.create', entity: 'Material', entityId: material._id, summary: material.name });
  if (material.quantity > 0) {
    await StockMovementModel.create({
      material: material._id,
      delta: material.quantity,
      balance: material.quantity,
      reason: 'purchase',
      note: 'Opening stock',
      by: req.auth!.id,
    });
  }
  await checkLowStock(String(material._id));
  res.status(201).json(await MaterialModel.findById(material._id));
});

adminInventoryRouter.patch('/:id', requireAdmin, validate({ params: idParams, body: materialInput.partial() }), async (req, res) => {
  const material = await MaterialModel.findById(req.params.id);
  if (!material) throw ApiError.notFound('Material');
  material.set(req.body);
  await material.save();
  audit(req, { action: 'inventory.update', entity: 'Material', entityId: material._id, changes: req.body });
  await checkLowStock(String(material._id));
  res.json(await MaterialModel.findById(material._id));
});

adminInventoryRouter.delete('/:id', requireAdmin, validate({ params: idParams }), async (req, res) => {
  const material = await MaterialModel.findById(req.params.id);
  if (!material) throw ApiError.notFound('Material');
  // History stays; the material just stops showing as active.
  material.isActive = false;
  await material.save();
  audit(req, { action: 'inventory.archive', entity: 'Material', entityId: material._id, summary: material.name });
  res.status(204).end();
});

adminInventoryRouter.get('/:id/movements', validate({ params: idParams }), async (req, res) => {
  const items = await StockMovementModel.find({ material: req.params.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('by', 'name')
    .lean();
  res.json(items);
});

/** Staff record usage, wastage and deliveries from the supplier. */
adminInventoryRouter.post('/:id/movements', validate({ params: idParams, body: movementInput }), async (req, res) => {
  const result = await recordMovement(req, req.params.id as string, req.body as z.infer<typeof movementInput>);
  res.status(201).json(result);
});
