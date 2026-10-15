import { Badge } from '@/components/ui/badge';
import type { BulkStatus, CardKind } from '@/types/admin';

export const BULK_STATUS_LABEL: Record<BulkStatus, string> = {
  queued: 'Queued',
  validating: 'Checking list',
  needs_fixes: 'Needs fixes',
  generating: 'Making print sheet',
  ready: 'Sheet ready',
  ordered: 'Ordered',
  failed: 'Failed',
};

const VARIANT: Record<BulkStatus, 'secondary' | 'info' | 'warning' | 'success' | 'destructive' | 'soft'> = {
  queued: 'secondary',
  validating: 'info',
  needs_fixes: 'warning',
  generating: 'info',
  ready: 'success',
  ordered: 'soft',
  failed: 'destructive',
};

export function BulkStatusBadge({ status }: { status: BulkStatus }) {
  return <Badge variant={VARIANT[status]}>{BULK_STATUS_LABEL[status]}</Badge>;
}

export const CARD_KIND_LABEL: Record<CardKind, string> = {
  student_id: 'Student ID',
  teacher_id: 'Teacher ID',
  out_pass: 'Out pass',
  fee_card: 'Fee card',
};
