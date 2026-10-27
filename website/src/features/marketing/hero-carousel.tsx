import { IconArrowRight, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SmartLink } from '@/components/common/smart-link';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Banner } from '@/types/api';
import { BannerBackground } from './banner-art';

/** Auto-advancing hero slides; swipe on touch, arrows and dots on desktop. Pauses on hover/focus. */
export function HeroCarousel({ slides }: { slides: Banner[] }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const goTo = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = el.children.length;
    el.scrollTo({ left: ((i + n) % n) * el.clientWidth, behavior: 'smooth' });
  }, []);

  // Follow manual swipes so the dots stay in sync.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setActive(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (slides.length < 2 || paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => goTo(active + 1), 6000);
    return () => window.clearInterval(id);
  }, [active, paused, slides.length, goTo]);

  return (
    <section
      className="container-page pt-2"
      aria-roledescription="carousel"
      aria-label={t('home.heroLabel')}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="group relative overflow-hidden rounded-2xl">
        <div ref={track} className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto">
          {slides.map((s, i) => (
            <div
              key={s._id}
              className="relative w-full shrink-0 snap-start"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} / ${slides.length}`}
              aria-hidden={i !== active}
            >
              <BannerBackground banner={s} />
              <div className="relative flex min-h-[260px] flex-col justify-center gap-3 px-6 py-10 text-white sm:min-h-[300px] sm:px-12 lg:min-h-[340px] lg:px-16">
                {s.badge && (
                  <span className="w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide ring-1 ring-white/25 backdrop-blur">{s.badge}</span>
                )}
                <h2 className="max-w-xl text-2xl leading-tight font-bold text-balance sm:text-4xl lg:text-5xl">{l(s.title)}</h2>
                {s.subtitle && l(s.subtitle) && <p className="max-w-lg text-sm text-white/85 sm:text-base">{l(s.subtitle)}</p>}
                {s.link && (
                  <SmartLink
                    href={s.link}
                    tabIndex={i === active ? 0 : -1}
                    className="mt-2 inline-flex h-11 w-fit items-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-orange-hover focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:outline-none"
                  >
                    {(s.ctaLabel && l(s.ctaLabel)) || t('home.shopNow')} <IconArrowRight className="size-4" />
                  </SmartLink>
                )}
              </div>
            </div>
          ))}
        </div>

        {slides.length > 1 && (
          <>
            {[-1, 1].map((dir) => (
              <button
                key={dir}
                type="button"
                onClick={() => goTo(active + dir)}
                aria-label={dir < 0 ? t('offers.previous') : t('offers.next')}
                className={cn(
                  'absolute top-1/2 hidden size-10 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-brand-navy shadow-md transition-opacity hover:bg-white sm:grid sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100',
                  dir < 0 ? 'left-3' : 'right-3',
                )}
              >
                {dir < 0 ? <IconChevronLeft className="size-5" /> : <IconChevronRight className="size-5" />}
              </button>
            ))}
            <div className="absolute inset-x-0 bottom-4 flex justify-center gap-1.5">
              {slides.map((s, i) => (
                <button
                  key={s._id}
                  type="button"
                  onClick={() => goTo(i)}
                  aria-label={`${i + 1} / ${slides.length}`}
                  aria-current={i === active}
                  className={cn('h-1.5 rounded-full transition-all', i === active ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80')}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
