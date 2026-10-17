import {
  IconCheck,
  IconExternalLink,
  IconMessageCircle,
  IconMessageReply,
  IconRosetteDiscountCheck,
  IconSearch,
  IconStarFilled,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { useState } from 'react';
import { confirmAction } from '@/components/common/confirm-dialog';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { Pagination } from '@/components/common/pagination';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useIsAdmin } from '@/features/auth/auth-store';
import { useAdminReviews, useDeleteReview, useUpdateReview, type AdminReview, type ReviewStatus } from '@/features/reviews/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const WEBSITE_URL = import.meta.env.VITE_WEBSITE_URL ?? 'http://localhost:5173';

const STATUS_BADGE: Record<ReviewStatus, { label: string; variant: 'warning' | 'success' | 'secondary' }> = {
  pending: { label: 'Pending', variant: 'warning' },
  approved: { label: 'Published', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'secondary' },
};

function Stars({ value }: { value: number }) {
  return (
    <span className="flex" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <IconStarFilled key={n} className={cn('size-4', n <= value ? 'text-amber-500' : 'text-muted-foreground/25')} />
      ))}
    </span>
  );
}

function StatTile({ label, value, hint, active, onClick }: { label: string; value: string | number; hint?: string; active?: boolean; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'rounded-xl border bg-card p-4 text-left transition-colors',
        onClick && 'hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none',
        active && 'border-primary ring-1 ring-primary',
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Comp>
  );
}

function ReviewCard({ review }: { review: AdminReview }) {
  const isAdmin = useIsAdmin();
  const update = useUpdateReview();
  const remove = useDeleteReview();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(review.reply?.text ?? '');
  const status = STATUS_BADGE[review.status];

  const run = async (
    body: { status?: ReviewStatus; featured?: boolean; reply?: string },
    ask: { title: string; description: string; confirmLabel: string; danger?: boolean },
    successTitle: string,
    after?: () => void,
  ) => {
    const ok = await confirmAction({
      ...ask,
      tone: ask.danger ? 'danger' : 'default',
      action: () => update.mutateAsync({ id: review._id, ...body }),
      successTitle,
    });
    if (ok) after?.();
  };

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-4 p-5 md:flex-row">
        <div className="flex min-w-0 flex-1 gap-4">
          <div className="hidden size-14 shrink-0 overflow-hidden rounded-lg border bg-muted sm:block">
            {review.product?.images?.[0] ? (
              <img src={review.product.images[0]} alt="" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-primary">
                <DynamicIcon name={review.product?.icon ?? 'printer'} className="size-6" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Stars value={review.rating} />
              <Badge variant={status.variant}>{status.label}</Badge>
              {review.verifiedPurchase && (
                <Badge variant="soft">
                  <IconRosetteDiscountCheck /> Verified purchase
                </Badge>
              )}
              {review.featured && <Badge variant="info">On home page</Badge>}
            </div>
            {review.title && <p className="font-semibold">{review.title}</p>}
            {review.comment ? (
              <p className="text-sm whitespace-pre-line text-muted-foreground">{review.comment}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Rating only, no comment.</p>
            )}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{review.authorName}</span>
              <Badge variant="outline" className="h-5 px-1.5 text-[11px]">
                {review.author.kind === 'institution' ? 'Institution' : 'Customer'}
              </Badge>
              <span>·</span>
              <span>{formatDate(review.updatedAt, 'en', true)}</span>
              {review.product && (
                <>
                  <span>·</span>
                  <a
                    href={`${WEBSITE_URL}/products/${review.product.slug}#reviews`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
                  >
                    {review.product.name.en} <IconExternalLink className="size-3" />
                  </a>
                </>
              )}
            </p>

            {review.reply?.text && !replying && (
              <div className="rounded-lg border-l-2 border-primary/50 bg-muted/50 px-3 py-2 text-sm">
                <p className="text-xs font-semibold text-primary">Your reply</p>
                <p className="text-muted-foreground">{review.reply.text}</p>
              </div>
            )}

            {replying && (
              <div className="space-y-2">
                <Label htmlFor={`reply-${review._id}`}>Public reply</Label>
                <Textarea id={`reply-${review._id}`} rows={3} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} autoFocus />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={update.isPending}
                    onClick={() =>
                      void run(
                        { reply },
                        reply.trim()
                          ? { title: 'Post this reply?', description: 'It is shown publicly under the review on the website.', confirmLabel: 'Post reply' }
                          : { title: 'Remove your reply?', description: 'The review stays; only your public reply is removed.', confirmLabel: 'Remove reply', danger: true },
                        reply.trim() ? 'Reply posted' : 'Reply removed',
                        () => setReplying(false),
                      )
                    }
                  >
                    {update.isPending && <Spinner className="size-3.5 text-current" />} Save reply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setReply(review.reply?.text ?? '');
                      setReplying(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-row flex-wrap items-center gap-2 border-t pt-4 md:w-44 md:flex-col md:items-stretch md:border-t-0 md:border-l md:pt-0 md:pl-4">
          {review.status !== 'approved' && (
            <Button
              size="sm"
              disabled={update.isPending}
              onClick={() =>
                void run(
                  { status: 'approved' },
                  { title: 'Publish this review?', description: `${review.rating}★ by ${review.authorName} will appear on the product page and count towards its rating.`, confirmLabel: 'Publish' },
                  'Review published',
                )
              }
            >
              <IconCheck /> Approve
            </Button>
          )}
          {review.status !== 'rejected' && (
            <Button
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() =>
                void run(
                  { status: 'rejected' },
                  { title: 'Reject this review?', description: 'It will be hidden from the website and removed from the rating. You can publish it later.', confirmLabel: 'Reject', danger: true },
                  'Review rejected',
                )
              }
            >
              <IconX /> Reject
            </Button>
          )}
          {!replying && (
            <Button size="sm" variant="outline" onClick={() => setReplying(true)}>
              <IconMessageReply /> {review.reply?.text ? 'Edit reply' : 'Reply'}
            </Button>
          )}
          <label className="flex h-8 items-center justify-between gap-2 rounded-md px-1 text-xs font-medium">
            Show on home
            <Switch
              checked={review.featured}
              disabled={update.isPending || review.status !== 'approved'}
              onCheckedChange={(v) =>
                void run(
                  { featured: v },
                  v
                    ? { title: 'Show on the home page?', description: 'This review is added to “What customers say” on the home page.', confirmLabel: 'Show on home' }
                    : { title: 'Remove from the home page?', description: 'The review stays published on its product page.', confirmLabel: 'Remove' },
                  v ? 'Added to home page' : 'Removed from home page',
                )
              }
            />
          </label>
          {isAdmin && (
            <Button
              size="sm"
              variant="danger"
              
              disabled={remove.isPending}
              onClick={() =>
                void confirmAction({
                  tone: 'danger',
                  title: `Delete this review by ${review.authorName}?`,
                  description: 'This cannot be undone. To hide it but keep a record, reject it instead.',
                  confirmLabel: 'Delete review',
                  action: () => remove.mutateAsync(review._id),
                  successTitle: 'Review deleted',
                })
              }
            >
              <IconTrash /> Delete
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function ReviewsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ReviewStatus | 'all'>('pending');
  const [rating, setRating] = useState('all');
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300) || undefined;
  const { data, isLoading, error, refetch } = useAdminReviews({
    page,
    status: status === 'all' ? undefined : status,
    rating: rating === 'all' ? undefined : Number(rating),
    q,
  });
  const stats = data?.stats;

  const pickStatus = (s: ReviewStatus | 'all') => {
    setStatus(s);
    setPage(1);
  };

  return (
    <div>
      <PageHeader title="Ratings & reviews" description="Approve reviews before they appear on the website, reply to customers and pick testimonials for the home page." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Average rating" value={stats ? (stats.averageRating ? `${stats.averageRating.toFixed(1)} ★` : '—') : '…'} hint="Published reviews" />
        <StatTile label="Awaiting approval" value={stats?.pending ?? '…'} hint="Need a decision" active={status === 'pending'} onClick={() => pickStatus('pending')} />
        <StatTile label="Published" value={stats?.approved ?? '…'} hint="Shown on the website" active={status === 'approved'} onClick={() => pickStatus('approved')} />
        <StatTile label="Rejected" value={stats?.rejected ?? '…'} hint="Hidden from customers" active={status === 'rejected'} onClick={() => pickStatus('rejected')} />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={status} onValueChange={(v) => pickStatus(v as ReviewStatus | 'all')}>
          <TabsList>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Published</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-1 gap-3">
          <div className="relative flex-1">
            <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Product, customer or text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <Select
            value={rating}
            onValueChange={(v) => {
              setRating(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36" aria-label="Filter by rating">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ratings</SelectItem>
              {[5, 4, 3, 2, 1].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} star{n > 1 ? 's' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid h-64 place-items-center">
          <Spinner />
        </div>
      ) : data?.items.length ? (
        <div className="space-y-3">
          {data.items.map((r) => (
            <ReviewCard key={r._id} review={r} />
          ))}
          <Card className="gap-0 py-0">
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </Card>
        </div>
      ) : (
        <Card className="gap-0 py-0">
          <EmptyState
            icon={<IconMessageCircle />}
            title={status === 'pending' ? 'Nothing waiting for approval' : 'No reviews found'}
            description={status === 'pending' ? 'New reviews from customers and institutions will show up here.' : 'Try a different filter or search.'}
          />
        </Card>
      )}
    </div>
  );
}
