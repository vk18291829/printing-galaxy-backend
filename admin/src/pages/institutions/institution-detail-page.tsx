import { IconBan, IconCheck, IconUsers, IconX } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { useBreadcrumbLabel } from '@/components/layout/breadcrumbs';
import { toast } from 'sonner';
import { ErrorState, PageLoader, Spinner } from '@/components/common/states';
import { InstitutionStatusBadge, OrderStatusBadge } from '@/components/common/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useIsAdmin } from '@/features/auth/auth-store';
import { useInstitution, useReviewInstitution } from '@/features/management/api';
import { useRoster } from '@/features/roster/api';
import { formatDate, formatINR } from '@/lib/format';
import type { InstitutionStatus } from '@/types/api';

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium wrap-break-word">{children || '—'}</p>
    </div>
  );
}

/** The institution's student/staff list, kept for ID card printing. */
function RosterCard({ institutionId }: { institutionId: string }) {
  const { data: students } = useRoster(institutionId, 'student');
  const { data: staff } = useRoster(institutionId, 'staff');
  const total = (students?.total ?? 0) + (staff?.total ?? 0);
  const photos = (students?.withPhoto ?? 0) + (staff?.withPhoto ?? 0);
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-4">
        <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
          <IconUsers className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Students & staff</p>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? 'No list yet. Import their Excel/CSV or add people.'
              : `${students?.total ?? 0} students · ${staff?.total ?? 0} staff · ${photos} of ${total} photos`}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link to={`/institutions/${institutionId}/students`}>Open list</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function InstitutionDetailPage() {
  const { id = '' } = useParams();
  const isAdmin = useIsAdmin();
  const { data, isLoading, error, refetch } = useInstitution(id);
  const review = useReviewInstitution(id);
  const [reason, setReason] = useState('');
  const [discount, setDiscount] = useState<string | null>(null);
  useBreadcrumbLabel(data?.name);

  if (isLoading) return <PageLoader />;
  if (error || !data) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const act = (status: InstitutionStatus) => {
    if ((status === 'rejected' || status === 'suspended') && !reason.trim()) {
      toast.error('Please write a reason — the institution will see it.');
      return;
    }
    const copy: Record<InstitutionStatus, { title: string; description: string; label: string; danger?: boolean }> = {
      approved: { title: `Approve ${data.name}?`, description: 'They get institution prices and bulk ordering straight away, and are notified.', label: 'Approve' },
      rejected: { title: `Reject ${data.name}?`, description: `They will see your reason: “${reason.trim()}”.`, label: 'Reject', danger: true },
      suspended: { title: `Suspend ${data.name}?`, description: `They lose institution prices and bulk ordering. Reason shown to them: “${reason.trim()}”.`, label: 'Suspend', danger: true },
      pending: { title: `Move ${data.name} back to pending?`, description: 'They keep individual prices until approved again.', label: 'Move to pending' },
    };
    const c = copy[status];
    void confirmAction({
      tone: c.danger ? 'danger' : 'default',
      title: c.title,
      description: c.description,
      confirmLabel: c.label,
      action: async () => {
        await review.mutateAsync({ status, reason: reason.trim() || undefined, extraDiscountPercent: discount === null ? undefined : Number(discount) });
        setReason('');
      },
      successTitle: `Institution ${status}`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
        <InstitutionStatusBadge status={data.status} />
      </div>

      <div className="grid items-start gap-6 *:min-w-0 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Info label="Type">
                <span className="capitalize">{data.type}</span>
              </Info>
              <Info label="Size">{data.size ? `${data.size} people` : ''}</Info>
              <Info label="GSTIN">{data.gstin}</Info>
              <Info label="Contact person">
                {data.contactName}
                {data.designation ? ` (${data.designation})` : ''}
              </Info>
              <Info label="Phone">{data.phone}</Info>
              <Info label="Email">{data.email}</Info>
              <div className="sm:col-span-3">
                <Info label="Address">
                  {[data.address.line1, data.address.line2, data.address.city, data.address.state, data.address.pincode].filter(Boolean).join(', ')}
                </Info>
              </div>
              <Info label="Registered">{formatDate(data.createdAt, 'en', true)}</Info>
              {data.reviewedAt && <Info label="Last reviewed">{formatDate(data.reviewedAt, 'en', true)}</Info>}
              {data.statusReason && <Info label="Reason">{data.statusReason}</Info>}
            </CardContent>
          </Card>

          <RosterCard institutionId={id} />

          <Card className="gap-0 pb-0">
            <CardHeader className="pb-4">
              <CardTitle>
                Orders · {data.stats.orders} · {formatINR(data.stats.revenue)}
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y px-0">
              {data.recentOrders.length === 0 && <p className="px-5 pb-5 text-sm text-muted-foreground">No orders yet.</p>}
              {data.recentOrders.map((o) => (
                <Link key={o._id} to={`/orders/${o._id}`} className="flex items-center justify-between px-5 py-3 hover:bg-accent/40">
                  <div>
                    <p className="font-mono text-sm font-semibold">{o.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(o.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <OrderStatusBadge status={o.status} />
                    <span className="font-semibold tabular-nums">{formatINR(o.totals.total)}</span>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        {isAdmin && (
          <Card className="self-start">
            <CardHeader>
              <CardTitle>Review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Extra discount on institution prices (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={discount ?? String(data.extraDiscountPercent ?? 0)}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reason / note</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required when rejecting or suspending" />
              </div>
              <div className="grid gap-2">
                {data.status !== 'approved' ? (
                  <Button onClick={() => act('approved')} disabled={review.isPending}>
                    {review.isPending ? <Spinner className="size-4 text-current" /> : <IconCheck />} Approve
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => act('approved')} disabled={review.isPending || discount === null}>
                    Save discount
                  </Button>
                )}
                {data.status === 'pending' && (
                  <Button variant="outline" className="text-destructive" onClick={() => act('rejected')} disabled={review.isPending}>
                    <IconX /> Reject
                  </Button>
                )}
                {data.status === 'approved' && (
                  <Button variant="outline" className="text-destructive" onClick={() => act('suspended')} disabled={review.isPending}>
                    <IconBan /> Suspend
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
