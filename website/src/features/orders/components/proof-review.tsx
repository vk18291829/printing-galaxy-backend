import { IconCheck, IconChevronDown, IconPencil, IconPhotoCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Spinner } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { OrderItem, Proof, UploadedFile } from '@/types/api';
import { useProofResponse } from '../api';
import { ProofViewer } from './proof-viewer';

const STATUS_VARIANT = { pending: 'warning', approved: 'success', changes_requested: 'secondary' } as const;

/** Earlier proofs (and the latest once answered), each openable, with the customer's reply. */
function ProofHistory({ proofs, open: initiallyOpen }: { proofs: Proof[]; open?: boolean }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState<string | null>(initiallyOpen ? (proofs.at(-1)?._id ?? null) : null);
  return (
    <ul className="divide-y rounded-xl shadow-card">
      {proofs.map((p, i) => {
        const file = typeof p.file === 'string' ? null : (p.file as UploadedFile);
        const expanded = open === p._id;
        return (
          <li key={p._id} className="p-3">
            <button
              type="button"
              className="flex w-full items-center gap-2 text-left text-sm"
              onClick={() => setOpen(expanded ? null : p._id)}
              aria-expanded={expanded}
              disabled={!file}
            >
              <span className="font-semibold">{t('orders.proofN', { n: i + 1 })}</span>
              <Badge variant={STATUS_VARIANT[p.status]}>{t(`orders.proofStatus.${p.status}`)}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">{formatDate(p.createdAt, i18n.language)}</span>
              {file && <IconChevronDown className={cn('size-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />}
            </button>
            {p.customerComment && <p className="mt-1 text-xs text-muted-foreground italic">“{p.customerComment}”</p>}
            {expanded && file && <ProofViewer file={file} className="mt-3" />}
          </li>
        );
      })}
    </ul>
  );
}

export function ProofReview({ orderId, item }: { orderId: string; item: OrderItem }) {
  const { t } = useTranslation();
  const respond = useProofResponse(orderId);
  const [changes, setChanges] = useState(false);
  const [comment, setComment] = useState('');
  const proof = item.proofs.at(-1);
  if (!proof) return null;
  const file = typeof proof.file === 'string' ? null : (proof.file as UploadedFile);

  // Answered: just the history, so the customer can look back at what was approved.
  if (proof.status !== 'pending') return <ProofHistory proofs={item.proofs} />;

  const submit = (decision: 'approved' | 'changes_requested') =>
    void confirmAction({
      title: decision === 'approved' ? t('confirm.proofApproveTitle') : t('confirm.proofChangesTitle'),
      description: decision === 'approved' ? t('confirm.proofApproveDesc') : t('confirm.proofChangesDesc'),
      confirmLabel: decision === 'approved' ? t('confirm.approve') : t('confirm.sendChanges'),
      action: () => respond.mutateAsync({ itemId: item._id, decision, comment: comment.trim() || undefined }),
      successTitle: decision === 'approved' ? t('orders.approved') : t('orders.changesSent'),
    });

  return (
    // Highlighted: printing waits for this answer.
    <div className="space-y-4 rounded-2xl border-2 border-brand-amber bg-brand-amber/8 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-amber text-brand-navy">
          <IconPhotoCheck className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-navy">
            {t('orders.proofTitle')}
            <span className="rounded-full bg-brand-amber px-2 py-0.5 text-xs font-semibold text-brand-navy">{t('updates.actionNeeded')}</span>
            {item.proofs.length > 1 && <span className="text-sm font-normal text-muted-foreground">{t('orders.proofN', { n: item.proofs.length })}</span>}
          </p>
          <p className="mt-0.5 text-sm text-foreground/80">{proof.message || t('orders.proofMessage')}</p>
        </div>
      </div>
      {file && <ProofViewer file={file} />}
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
            <Button onClick={() => submit('approved')} disabled={respond.isPending}>
              {respond.isPending ? <Spinner className="size-4 text-current" /> : <IconCheck />} {t('orders.approve')}
            </Button>
            <Button variant="outline" onClick={() => setChanges(true)}>
              <IconPencil /> {t('orders.requestChanges')}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => submit('changes_requested')} disabled={!comment.trim() || respond.isPending}>
              {respond.isPending && <Spinner className="size-4 text-current" />} {t('orders.requestChanges')}
            </Button>
            <Button variant="ghost" onClick={() => setChanges(false)}>
              {t('common.cancel')}
            </Button>
          </>
        )}
      </div>
      {item.proofs.length > 1 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground">{t('orders.earlierProofs')}</summary>
          <div className="mt-2">
            <ProofHistory proofs={item.proofs.slice(0, -1)} />
          </div>
        </details>
      )}
    </div>
  );
}
