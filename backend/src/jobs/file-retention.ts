import { logger } from '@/config/logger';
import { FileModel } from '@/modules/uploads/file.model';
import { deleteObject } from '@/modules/uploads/storage';

const HOUR = 60 * 60 * 1000;

/**
 * Deletes (1) sensitive identity documents past their retention date and
 * (2) abandoned uploads that were never attached to an order.
 */
export async function runFileRetention() {
  const now = new Date();
  const candidates = await FileModel.find({
    status: { $ne: 'deleted' },
    $or: [
      { deleteAfter: { $lte: now } },
      { order: { $exists: false }, purpose: 'order', createdAt: { $lte: new Date(now.getTime() - 48 * HOUR) } },
      // Bulk uploads that never became an order.
      { order: { $exists: false }, purpose: 'bulk', createdAt: { $lte: new Date(now.getTime() - 30 * 24 * HOUR) } },
      // Roster photos that were uploaded but never saved to a person.
      { attachedAt: { $exists: false }, purpose: 'roster', createdAt: { $lte: new Date(now.getTime() - 48 * HOUR) } },
      // Profile photos that were uploaded but never saved to the profile.
      { attachedAt: { $exists: false }, purpose: 'avatar', createdAt: { $lte: new Date(now.getTime() - 48 * HOUR) } },
    ],
  }).limit(500);

  let deleted = 0;
  for (const file of candidates) {
    try {
      await deleteObject(file.bucket as 'private' | 'public', file.key);
      file.status = 'deleted';
      await file.save();
      deleted += 1;
    } catch (err) {
      logger.warn({ err, key: file.key }, 'Retention: could not delete file');
    }
  }
  if (deleted) logger.info({ deleted }, 'Retention: removed expired files');
}

export function scheduleFileRetention() {
  const tick = () => runFileRetention().catch((err) => logger.error({ err }, 'Retention job failed'));
  setTimeout(tick, 60_000).unref();
  setInterval(tick, HOUR).unref();
}
