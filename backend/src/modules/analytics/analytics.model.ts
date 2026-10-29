import { Schema, model } from 'mongoose';

/**
 * Website visits, counted without cookies and without personal data: one document per day (IST)
 * with totals, plus one per day and page. Raw IP addresses and browser details are never stored.
 */
const trafficDaySchema = new Schema(
  {
    /** YYYY-MM-DD in Indian time. */
    date: { type: String, required: true, unique: true },
    views: { type: Number, default: 0 },
    /** Distinct visitors that day (see visitorDay). */
    visitors: { type: Number, default: 0 },
    sources: {
      direct: { type: Number, default: 0 },
      search: { type: Number, default: 0 },
      social: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
    devices: {
      mobile: { type: Number, default: 0 },
      tablet: { type: Number, default: 0 },
      desktop: { type: Number, default: 0 },
    },
  },
  { versionKey: false },
);

const pageDaySchema = new Schema(
  {
    date: { type: String, required: true },
    path: { type: String, required: true },
    views: { type: Number, default: 0 },
  },
  { versionKey: false },
);
pageDaySchema.index({ date: 1, path: 1 }, { unique: true });

/**
 * "Seen this visitor today?" A one-way hash that changes every day (it mixes in a secret and the
 * date), so it cannot be traced back to a person or linked across days. Deleted after two days.
 */
const visitorDaySchema = new Schema(
  {
    _id: { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 2 * 86_400 },
  },
  { versionKey: false },
);

export const TrafficDayModel = model('TrafficDay', trafficDaySchema);
export const PageDayModel = model('PageDay', pageDaySchema);
export const VisitorDayModel = model('VisitorDay', visitorDaySchema);
