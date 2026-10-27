import { IconArrowRight, IconSparkles } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { SmartLink } from '@/components/common/smart-link';
import { useLocalized } from '@/lib/i18n';
import type { Banner } from '@/types/api';
import { BannerBackground } from './banner-art';

/** Two or three gradient tiles linking into categories or campaigns. */
export function PromoTiles({ banners }: { banners: Banner[] }) {
  const { t } = useTranslation();
  const l = useLocalized();
  return (
    <section className="container-page py-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {banners.slice(0, 3).map((b) => (
          <SmartLink key={b._id} href={b.link} className="group relative isolate block min-h-40 overflow-hidden rounded-xl text-white">
            <BannerBackground banner={b} className="-z-10 transition-transform duration-500 group-hover:scale-[1.03]" />
            <div className="flex h-full min-h-40 flex-col justify-end gap-1 p-5">
              {b.badge && <span className="mb-auto w-fit rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur">{b.badge}</span>}
              <p className="text-lg font-bold">{l(b.title)}</p>
              {b.subtitle && l(b.subtitle) && <p className="text-sm text-white/85">{l(b.subtitle)}</p>}
              {b.link && (
                <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold">
                  {(b.ctaLabel && l(b.ctaLabel)) || t('home.shopNow')}
                  <IconArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              )}
            </div>
          </SmartLink>
        ))}
      </div>
    </section>
  );
}

/** Wide announcement for a newly launched feature. */
export function FeatureBanner({ banner }: { banner: Banner }) {
  const { t } = useTranslation();
  const l = useLocalized();
  return (
    <section className="container-page py-6">
      <div className="relative isolate overflow-hidden rounded-2xl text-white">
        <BannerBackground banner={banner} className="-z-10" />
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur">
              <IconSparkles className="size-6" />
            </span>
            <div>
              <span className="mb-1.5 inline-block rounded bg-brand-yellow px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-brand-navy uppercase">
                {banner.badge || t('home.newBadge')}
              </span>
              <h2 className="text-xl font-bold sm:text-2xl">{l(banner.title)}</h2>
              {banner.subtitle && l(banner.subtitle) && <p className="mt-1 max-w-2xl text-sm text-white/85">{l(banner.subtitle)}</p>}
            </div>
          </div>
          {banner.link && (
            <SmartLink
              href={banner.link}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-white px-5 text-sm font-semibold text-brand-navy hover:bg-white/90 focus-visible:ring-4 focus-visible:ring-white/40 focus-visible:outline-none"
            >
              {(banner.ctaLabel && l(banner.ctaLabel)) || t('home.tryIt')} <IconArrowRight className="size-4" />
            </SmartLink>
          )}
        </div>
      </div>
    </section>
  );
}
