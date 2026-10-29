import { IconMessageCircle, IconPencil, IconRosetteDiscountCheck, IconStarFilled } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { StarInput, StarRating } from '@/components/common/star-rating';
import { Spinner } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/features/auth/auth-store';
import { formatDate } from '@/lib/format';
import type { Review } from '@/types/api';
import { useProductReviews, useSubmitReview } from './api';

/** "★ 4.6 · 23 reviews" link under the product title that jumps to the reviews section. */
export function RatingSummaryLink({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const { data } = useProductReviews(slug);
  // Nothing under the title until there are reviews to show.
  if (!data || data.summary.count === 0) return null;
  const { average, count } = data.summary;
  return (
    <a href="#reviews" className="inline-flex items-center gap-2 text-sm hover:underline">
      <StarRating value={average} />
      <span className="font-semibold tabular-nums">{average.toFixed(1)}</span>
      <span className="text-muted-foreground">{t('reviews.count', { count })}</span>
    </a>
  );
}

function ReviewForm({ slug, existing, onDone }: { slug: string; existing: Review | null; onDone: () => void }) {
  const { t } = useTranslation();
  const submit = useSubmitReview(slug);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [comment, setComment] = useState(existing?.comment ?? '');
  const labels = t('reviews.ratingLabels', { returnObjects: true }) as string[];

  return (
    <form
      className="space-y-4 rounded-xl shadow-card bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!rating) return toast.error(t('reviews.pickRating'));
        void confirmAction({
          title: t('confirm.reviewTitle'),
          description: t('confirm.reviewDesc'),
          confirmLabel: t('reviews.submit'),
          action: () => submit.mutateAsync({ rating, title, comment }),
          successTitle: t('confirm.reviewSubmitted'),
          successDescription: t('reviews.submitted'),
        }).then((ok) => ok && onDone());
      }}
    >
      <div className="space-y-2">
        <Label>{t('reviews.yourRating')}</Label>
        <StarInput value={rating} onChange={setRating} labels={labels} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="review-title">
          {t('reviews.headline')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
        </Label>
        <Input id="review-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={t('reviews.headlinePlaceholder')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="review-comment">{t('reviews.comment')}</Label>
        <Textarea id="review-comment" rows={4} value={comment} maxLength={2000} onChange={(e) => setComment(e.target.value)} placeholder={t('reviews.commentPlaceholder')} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={submit.isPending}>
          {submit.isPending && <Spinner className="size-4 text-current" />} {t('reviews.submit')}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <p className="w-full text-xs text-muted-foreground">{t('reviews.moderationNote')}</p>
      </div>
    </form>
  );
}

function ReviewItem({ review, own }: { review: Review; own?: boolean }) {
  const { t, i18n } = useTranslation();
  const name = own ? t('reviews.you') : review.authorName;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-navy text-sm font-bold text-white">
            {(review.authorName || '?').slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{name}</p>
            <p className="text-xs text-muted-foreground">{formatDate(review.updatedAt, i18n.language)}</p>
          </div>
        </div>
        <StarRating value={review.rating} size="size-4" />
      </div>
      {(review.verifiedPurchase || (own && review.status && review.status !== 'approved')) && (
        <div className="flex flex-wrap gap-2">
          {review.verifiedPurchase && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              <IconRosetteDiscountCheck className="size-3.5" /> {t('reviews.verified')}
            </span>
          )}
          {own && review.status && review.status !== 'approved' && (
            <Badge variant={review.status === 'pending' ? 'warning' : 'secondary'}>{t(`reviews.status.${review.status}`)}</Badge>
          )}
        </div>
      )}
      {review.title && <p className="font-semibold text-foreground">{review.title}</p>}
      {review.comment && <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{review.comment}</p>}
      {review.reply?.text && (
        <div className="rounded-xl bg-secondary/70 p-3 text-sm">
          <p className="text-xs font-semibold text-primary">{t('reviews.shopReply')}</p>
          <p className="mt-0.5 text-muted-foreground">{review.reply.text}</p>
        </div>
      )}
    </li>
  );
}

export function ProductReviews({ slug }: { slug: string }) {
  const { t } = useTranslation();
  const location = useLocation();
  const principal = useAuthStore((s) => s.principal);
  const { data } = useProductReviews(slug);
  const [writing, setWriting] = useState(false);
  if (!data) return null;

  const { summary, reviews, mine } = data;
  const isStaff = principal?.kind === 'user' && principal.user.role !== 'customer';
  const others = reviews.filter((r) => r._id !== mine?._id);
  const writeButton = isStaff ? null : principal ? (
    !writing && (
      <Button variant="brand" onClick={() => setWriting(true)}>
        <IconPencil /> {mine ? t('reviews.edit') : t('reviews.write')}
      </Button>
    )
  ) : (
    <Button variant="brand" asChild>
      <Link to="/login" state={{ from: `${location.pathname}#reviews` }}>
        <IconPencil /> {t('reviews.signInToWrite')}
      </Link>
    </Button>
  );

  return (
    <section id="reviews" className="mt-12 scroll-mt-32 border-t pt-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-brand-navy">{t('reviews.title')}</h2>
          <p className="mt-1 text-muted-foreground">{t('reviews.subtitle')}</p>
        </div>
        {writeButton}
      </div>

      <div className="grid gap-6 *:min-w-0 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8">
        {/* The score at a glance. */}
        <div className="space-y-5 self-start rounded-2xl bg-brand-navy p-6 text-white lg:sticky lg:top-32">
          <div>
            {summary.count ? (
              <p className="flex items-end gap-2">
                <span className="text-5xl leading-none font-bold tabular-nums">{summary.average.toFixed(1)}</span>
                <span className="pb-1 text-white/60">/ 5</span>
              </p>
            ) : (
              <p className="text-xl font-bold">{t('reviews.empty')}</p>
            )}
            {/* Empty stars in soft white so they show on navy. */}
            <StarRating value={summary.average} size="size-5" className="mt-3 [&>span:first-child]:text-white/25" />
            <p className="mt-1.5 text-sm text-white/70">{t('reviews.count', { count: summary.count })}</p>
          </div>
          {/* The breakdown only means something once there are reviews. */}
          {summary.count > 0 && (
          <ul className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => {
              const n = summary.breakdown[star - 1];
              const pct = summary.count ? (n / summary.count) * 100 : 0;
              return (
                <li key={star} className="flex items-center gap-2 text-sm">
                  <span className="flex w-7 items-center gap-0.5 tabular-nums">
                    {star} <IconStarFilled className="size-3 text-brand-amber" />
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                    <span className="block h-full rounded-full bg-brand-amber" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-6 text-right text-xs text-white/60 tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
          )}
        </div>

        <div className="space-y-4">
          {writing && <ReviewForm slug={slug} existing={mine} onDone={() => setWriting(false)} />}
          {mine && !writing && (
            <ul>
              <ReviewItem review={mine} own />
            </ul>
          )}
          {others.length > 0 ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {others.map((r) => (
                <ReviewItem key={r._id} review={r} />
              ))}
            </ul>
          ) : (
            !mine &&
            !writing && (
              <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
                <span className="grid size-12 place-items-center rounded-full bg-secondary text-primary">
                  <IconMessageCircle className="size-6" />
                </span>
                <p className="font-semibold text-foreground">{t('reviews.empty')}</p>
                <p className="max-w-sm text-sm text-muted-foreground">{t('reviews.emptyHint')}</p>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}
