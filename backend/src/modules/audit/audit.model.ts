import { Schema, model } from 'mongoose';
import type { Request } from 'express';
import { logger } from '@/config/logger';

const auditSchema = new Schema(
  {
    actor: {
      id: Schema.Types.ObjectId,
      kind: { type: String, enum: ['user', 'institution', 'system'] },
      role: String,
    },
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId, index: true },
    summary: String,
    changes: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: { versionKey: false } },
);

auditSchema.index({ createdAt: -1 });

export const AuditLogModel = model('AuditLog', auditSchema);

interface AuditEntry {
  action: string;
  entity: string;
  entityId?: unknown;
  summary?: string;
  changes?: unknown;
}

/** Fire-and-forget audit record; never blocks or fails the request. */
export function audit(req: Request | null, entry: AuditEntry) {
  AuditLogModel.create({
    ...entry,
    actor: req?.auth
      ? { id: req.auth.id, kind: req.auth.kind, role: req.auth.role }
      : { kind: 'system' },
    ip: req?.ip,
  }).catch((err) => logger.error({ err }, 'Failed to write audit log'));
}
