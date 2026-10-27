import { Schema, model } from 'mongoose';

const counterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const CounterModel = model('Counter', counterSchema);

/** Atomic, gap-free sequence per key (e.g. invoice numbers per financial year). */
export async function nextSequence(key: string) {
  return (await reserveSequence(key, 1))[0]!;
}

/** Reserves `count` consecutive numbers in one atomic step. */
export async function reserveSequence(key: string, count: number) {
  const doc = await CounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: count } },
    { upsert: true, new: true },
  ).lean();
  return Array.from({ length: count }, (_, i) => doc.seq - count + 1 + i);
}

/** Indian financial year label for a date, e.g. 2026-10-15 → "2026-27". */
export function financialYear(d = new Date()) {
  const ist = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const start = ist.getMonth() >= 3 ? ist.getFullYear() : ist.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
