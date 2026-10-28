import { IconCheck, IconChevronLeft, IconChevronRight, IconCopy, IconDiscount2, IconPackage, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { InstallAppButton } from '@/features/pwa/pwa';
import { toast } from 'sonner';
import { LanguageSwitcher } from '@/components/common/language-switcher';
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

/**
 * Navy bar above the header: language toggle on the left, rotating offers in the middle
 * (closable for the session), order tracking on the right. The bar itself always shows.
 */
export function TopBar() {
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

  const showOffers = !dismissed && offers.length > 0;
  const offer = showOffers ? offers[index % offers.length]! : null;
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
      className="relative bg-brand-navy text-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="container-page flex h-9 items-center gap-3 text-xs sm:text-[13px]">
        <LanguageSwitcher />

        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5" aria-live="polite">
          {offer && (
            <>
              {offers.length > 1 && (
                <button type="button" onClick={() => step(-1)} className="hidden rounded p-1 text-white/60 hover:text-white sm:block" aria-label={t('offers.previous')}>
                  <IconChevronLeft className="size-4" />
                </button>
              )}
              <IconDiscount2 className="hidden size-4 shrink-0 text-brand-yellow min-[420px]:block" />
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
              {offers.length > 1 && (
                <button type="button" onClick={() => step(1)} className="hidden rounded p-1 text-white/60 hover:text-white sm:block" aria-label={t('offers.next')}>
                  <IconChevronRight className="size-4" />
                </button>
              )}
            </>
          )}
        </div>

        <InstallAppButton variant="link" className="hidden text-white/75 hover:text-white lg:inline-flex" />
        <Link to="/track" className="hidden shrink-0 items-center gap-1.5 font-medium text-white/75 hover:text-white md:inline-flex">
          <IconPackage className="size-3.5" /> {t('footer.track')}
        </Link>
        {offer && (
          <button type="button" onClick={dismiss} className="shrink-0 rounded p-1 text-white/60 hover:text-white" aria-label={t('common.close')}>
            <IconX className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
