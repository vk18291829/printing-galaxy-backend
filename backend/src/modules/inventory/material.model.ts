import { Schema, model, type InferSchemaType } from 'mongoose';

export const MATERIAL_UNITS = ['sheets', 'cards', 'pcs', 'rolls', 'packs', 'ml', 'kg', 'm'] as const;
export const MOVEMENT_REASONS = ['purchase', 'usage', 'wastage', 'correction'] as const;

/** Consumables the shop prints on: PVC sheets, A4 reams, lamination rolls, ink, key-chain blanks… */
const materialSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    unit: { type: String, enum: MATERIAL_UNITS, default: 'pcs' },
    quantity: { type: Number, default: 0 },
    /** At or below this the material shows as low and the shop gets one alert. */
    lowStockThreshold: { type: Number, default: 0, min: 0 },
    reorderQuantity: { type: Number, min: 0 },
    supplier: { type: String, trim: true },
    notes: { type: String, trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true, index: true },
    /** Set when the low-stock alert is sent; cleared when stock goes back above the threshold. */
    lowStockAlertedAt: Date,
  },
  { timestamps: true, toJSON: { versionKey: false } },
);

materialSchema.index({ name: 1 });

const movementSchema = new Schema(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true, index: true },
    delta: { type: Number, required: true },
    balance: { type: Number, required: true },
    reason: { type: String, enum: MOVEMENT_REASONS, required: true },
    note: { type: String, trim: true, maxlength: 300 },
    order: { type: Schema.Types.ObjectId, ref: 'Order' },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: { versionKey: false } },
);

movementSchema.index({ material: 1, createdAt: -1 });

export type Material = InferSchemaType<typeof materialSchema>;
export const MaterialModel = model('Material', materialSchema);
export const StockMovementModel = model('StockMovement', movementSchema);

/** Mongo filter for "at or below threshold" on active materials. */
export const LOW_STOCK_FILTER = {
  isActive: true,
  lowStockThreshold: { $gt: 0 },
  $expr: { $lte: ['$quantity', '$lowStockThreshold'] },
};
