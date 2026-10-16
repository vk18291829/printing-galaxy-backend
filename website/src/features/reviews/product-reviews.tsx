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
  if (!data) return null;
  const { average, count } = data.summary;
  return (
    <a href="#reviews" className="inline-flex items-center gap-2 text-sm hover:underline">
      {count > 0 ? (
        <>
          <StarRating value={average} />
          <span className="font-semibold tabular-nums">{average.toFixed(1)}</span>
          <span className="text-muted-foreground">{t('reviews.count', { count })}</span>
        </>
      ) : (
        <span className="text-muted-foreground">{t('reviews.beFirst')}</span>
      )}
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
      className="space-y-4 rounded-xl border bg-card p-5"
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
  return (
    <li className="space-y-2 py-5 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StarRating value={review.rating} size="size-3.5" />
        {review.title && <p className="font-semibold">{review.title}</p>}
        {own && review.status && review.status !== 'approved' && (
          <Badge variant={review.status === 'pending' ? 'warning' : 'secondary'}>{t(`reviews.status.${review.status}`)}</Badge>
        )}
      </div>
      {review.comment && <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{review.comment}</p>}
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{own ? t('reviews.you') : review.authorName}</span>
        <span>·</span>
        <span>{formatDate(review.updatedAt, i18n.language)}</span>
        {review.verifiedPurchase && (
          <span className="inline-flex items-center gap-1 text-success">
            <IconRosetteDiscountCheck className="size-3.5" /> {t('reviews.verified')}
          </span>
        )}
      </p>
      {review.reply?.text && (
        <div className="ml-1 border-l-2 border-primary/40 pl-3 text-sm">
          <p className="text-xs font-semibold text-primary">{t('reviews.shopReply')}</p>
          <p className="text-muted-foreground">{review.reply.text}</p>
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

  return (
    <section id="reviews" className="scroll-mt-32 border-t pt-10 pb-6">
      <h2 className="mb-6 text-xl font-semibold tracking-tight sm:text-2xl">{t('reviews.title')}</h2>
      <div className="grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <p className="text-5xl font-bold tabular-nums">{summary.count ? summary.average.toFixed(1) : '–'}</p>
            <div className="space-y-1">
              <StarRating value={summary.average} />
              <p className="text-sm text-muted-foreground">{t('reviews.count', { count: summary.count })}</p>
            </div>
          </div>
          <ul className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const n = summary.breakdown[star - 1];
              const pct = summary.count ? (n / summary.count) * 100 : 0;
              return (
                <li key={star} className="flex items-center gap-2 text-sm">
                  <span className="flex w-7 items-center gap-0.5 tabular-nums">
                    {star} <IconStarFilled className="size-3 text-amber-500" />
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-8 text-right text-xs text-muted-foreground tabular-nums">{n}</span>
                </li>
              );
            })}
          </ul>
          {!isStaff &&
            (principal ? (
              !writing && (
                <Button variant="outline" className="w-full" onClick={() => setWriting(true)}>
                  <IconPencil /> {mine ? t('reviews.edit') : t('reviews.write')}
                </Button>
              )
            ) : (
              <Button variant="outline" className="w-full" asChild>
                <Link to="/login" state={{ from: `${location.pathname}#reviews` }}>
                  <IconPencil /> {t('reviews.signInToWrite')}
                </Link>
              </Button>
            ))}
        </div>

        <div className="min-w-0 space-y-6">
          {writing && <ReviewForm slug={slug} existing={mine} onDone={() => setWriting(false)} />}
          {mine && !writing && (
            <ul className="rounded-xl border bg-muted/30 px-5 pt-5">
              <ReviewItem review={mine} own />
            </ul>
          )}
          {others.length > 0 ? (
            <ul className="divide-y">
              {others.map((r) => (
                <ReviewItem key={r._id} review={r} />
              ))}
            </ul>
          ) : (
            !mine &&
            !writing && (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
                <IconMessageCircle className="size-8 text-muted-foreground" />
                <p className="font-medium">{t('reviews.empty')}</p>
                <p className="text-sm text-muted-foreground">{t('reviews.emptyHint')}</p>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}
