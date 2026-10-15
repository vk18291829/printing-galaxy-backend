import { IconCheck, IconEye, IconPencil } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { openFile } from '@/features/uploads/upload-file';
import { getErrorMessage } from '@/lib/api-client';
import type { OrderItem } from '@/types/api';
import { useProofResponse } from '../api';

export function ProofReview({ orderId, item }: { orderId: string; item: OrderItem }) {
  const { t } = useTranslation();
  const respond = useProofResponse(orderId);
  const [changes, setChanges] = useState(false);
  const [comment, setComment] = useState('');
  const proof = item.proofs.at(-1);
  if (!proof || proof.status !== 'pending') return null;
  const fileId = typeof proof.file === 'string' ? proof.file : proof.file._id;

  const submit = (decision: 'approved' | 'changes_requested') =>
    respond.mutate(
      { itemId: item._id, decision, comment: comment.trim() || undefined },
      {
        onSuccess: () => toast.success(decision === 'approved' ? t('orders.approved') : t('orders.changesSent')),
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );

  return (
    <div className="space-y-3 rounded-xl border border-warning/50 bg-warning/8 p-4">
      <div>
        <p className="font-semibold">{t('orders.proofTitle')}</p>
        <p className="text-sm text-muted-foreground">{proof.message || t('orders.proofMessage')}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => void openFile(fileId).catch((e) => toast.error(getErrorMessage(e)))}>
        <IconEye /> {t('orders.viewProof')}
      </Button>
      {changes && (
        <Textarea
          autoFocus
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t('orders.changesPlaceholder')}
          maxLength={1000}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {!changes ? (
          <>
            <Button size="sm" onClick={() => submit('approved')} disabled={respond.isPending}>
              {respond.isPending ? <Spinner className="size-4 text-current" /> : <IconCheck />} {t('orders.approve')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChanges(true)}>
              <IconPencil /> {t('orders.requestChanges')}
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={() => submit('changes_requested')} disabled={!comment.trim() || respond.isPending}>
              {respond.isPending && <Spinner className="size-4 text-current" />} {t('orders.requestChanges')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setChanges(false)}>
              {t('common.cancel')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
