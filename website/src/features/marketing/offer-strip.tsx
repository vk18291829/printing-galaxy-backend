import { IconCheck, IconChevronLeft, IconChevronRight, IconCopy, IconDiscount2, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { SmartLink } from '@/components/common/smart-link';
import { useLocalized } from '@/lib/i18n';
import { useBanners } from './api';

const DISMISS_KEY = 'pg-offer-strip-dismissed';

function readDismissed() {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Rotating offer messages above the header. Hidden for the session once closed. */
export function OfferStrip() {
  const { t } = useTranslation();
  const l = useLocalized();
  const { banners } = useBanners();
  const offers = banners.offer;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    if (offers.length < 2 || paused) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % offers.length), 5000);
    return () => window.clearInterval(id);
  }, [offers.length, paused]);

  if (dismissed || offers.length === 0) return null;
  const offer = offers[index % offers.length]!;
  const step = (d: number) => setIndex((i) => (i + d + offers.length) % offers.length);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(t('offers.copied', { code }));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('offers.copyFailed'));
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Not remembered in private mode.
    }
  };

  return (
    <div
      className="relative bg-zinc-950 text-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="container-page flex h-9 items-center gap-2 text-xs sm:text-[13px]">
        {offers.length > 1 && (
          <button type="button" onClick={() => step(-1)} className="hidden rounded p-1 text-white/60 hover:text-white sm:block" aria-label={t('offers.previous')}>
            <IconChevronLeft className="size-4" />
          </button>
        )}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2" aria-live="polite">
          <IconDiscount2 className="size-4 shrink-0 text-brand-yellow" />
          <SmartLink key={offer._id} href={offer.link} className="truncate font-medium hover:underline">
            {l(offer.title)}
          </SmartLink>
          {offer.couponCode && (
            <button
              type="button"
              onClick={() => void copy(offer.couponCode!)}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-dashed border-white/40 px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide hover:border-white hover:bg-white/10"
              aria-label={t('offers.copyCode', { code: offer.couponCode })}
            >
              {offer.couponCode}
              {copied ? <IconCheck className="size-3" /> : <IconCopy className="size-3" />}
            </button>
          )}
        </div>
        {offers.length > 1 && (
          <button type="button" onClick={() => step(1)} className="hidden rounded p-1 text-white/60 hover:text-white sm:block" aria-label={t('offers.next')}>
            <IconChevronRight className="size-4" />
          </button>
        )}
        <button type="button" onClick={dismiss} className="rounded p-1 text-white/60 hover:text-white" aria-label={t('common.close')}>
          <IconX className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
