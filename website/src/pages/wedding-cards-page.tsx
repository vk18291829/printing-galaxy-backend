import '@fontsource-variable/playfair-display';
import {
  IconArrowRight,
  IconBox,
  IconCalendarHeart,
  IconPhotoCheck,
  IconSparkles,
  IconWritingSign,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { InfiniteProductGrid } from '@/features/catalog/components/infinite-product-grid';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { cn } from '@/lib/utils';

const CATEGORY = 'wedding-invitations';

/** Wedding-only accents: ivory paper and a muted gold, used alongside the brand navy and orange. */
const SERIF = "font-['Playfair_Display_Variable',serif]";

/** A small ornament: two hairlines around a diamond. */
function Flourish({ className = '' }: { className?: string }) {
  return (
    <span className={cn('flex items-center justify-center gap-2 text-[#b8875b]', className)} aria-hidden>
      <span className="h-px w-10 bg-current opacity-60" />
      <span className="size-1.5 rotate-45 bg-current" />
      <span className="h-px w-10 bg-current opacity-60" />
    </span>
  );
}

/** Envelope, invitation card and a save-the-date. */
function InvitationVisual() {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[480px] select-none" aria-hidden>
      <div className="absolute inset-[8%] rounded-full bg-[#f3e3d3] blur-3xl" />

      {/* Envelope */}
      <div className="absolute top-[14%] left-[2%] aspect-[4/3] w-[62%] rotate-[-8deg] overflow-hidden rounded-md bg-[#e9d6c1] shadow-xl shadow-[#7a5233]/15">
        <div className="absolute inset-x-0 top-0 h-1/2 origin-top bg-[#dfc7ad] [clip-path:polygon(0_0,100%_0,50%_100%)]" />
        <span className="absolute top-[42%] left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full bg-[#9b2335] text-[10px] font-bold text-white/90 shadow-md">
          A&D
        </span>
      </div>

      {/* Invitation */}
      <div className="absolute top-[8%] right-[6%] w-[56%] rotate-[4deg] rounded-md bg-[#fffdf8] p-2 shadow-2xl shadow-[#7a5233]/25">
        <div className="flex flex-col items-center rounded-sm shadow-card border-[#b8875b]/60 px-4 py-7 text-center outline outline-1 outline-offset-[-6px] outline-[#b8875b]/30">
          <p className="text-[8px] font-semibold tracking-[0.25em] text-[#b8875b] uppercase">{t('wedding.mockTogether')}</p>
          <p className={`${SERIF} mt-3 text-2xl leading-tight text-brand-navy italic sm:text-[1.75rem]`}>
            Aarav
            <span className="block text-base text-[#b8875b] not-italic">&amp;</span>
            Diya
          </p>
          <Flourish className="my-3" />
          <p className={`${SERIF} text-sm font-semibold text-brand-navy`}>12 · 02 · 2027</p>
          <p className="mt-1 text-[9px] text-brand-navy/60">Jaipur</p>
        </div>
      </div>

      {/* Save the date */}
      <div className="absolute bottom-[8%] left-[18%] w-[40%] rotate-[-3deg] rounded-md bg-brand-navy p-4 text-center text-white shadow-xl shadow-brand-navy/30">
        <p className={`${SERIF} text-lg italic`}>Save the date</p>
        <span className="mx-auto mt-2 block h-px w-12 bg-[#d9b48f]" />
        <p className="mt-2 text-[10px] tracking-[0.2em] text-white/70 uppercase">Feb 2027</p>
      </div>

      <span className="absolute top-[4%] left-[44%] size-2 rounded-full bg-[#b8875b]" />
      <span className="absolute right-[4%] bottom-[24%] size-2.5 rounded-full bg-primary/70" />
    </div>
  );
}

export default function WeddingCardsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('seo.weddingTitle'), { description: t('seo.weddingDesc') });

  const details = [
    { icon: IconWritingSign, title: t('wedding.detail1Title'), desc: t('wedding.detail1Desc') },
    { icon: IconPhotoCheck, title: t('wedding.detail2Title'), desc: t('wedding.detail2Desc') },
    { icon: IconBox, title: t('wedding.detail3Title'), desc: t('wedding.detail3Desc') },
    { icon: IconCalendarHeart, title: t('wedding.detail4Title'), desc: t('wedding.detail4Desc') },
  ];
  const steps = [
    { title: t('wedding.step1Title'), desc: t('wedding.step1Desc') },
    { title: t('wedding.step2Title'), desc: t('wedding.step2Desc') },
    { title: t('wedding.step3Title'), desc: t('wedding.step3Desc') },
    { title: t('wedding.step4Title'), desc: t('wedding.step4Desc') },
  ];

  return (
    <div className="-mb-20 bg-[#fbf7f2] pb-20 lg:-mb-24 lg:pb-24">
      <section className="relative overflow-hidden border-b border-[#ecdfd0]">
        <div className="absolute -top-40 -left-40 size-[480px] rounded-full bg-[#f6e6d6] blur-3xl" />
        <div className="container-page relative grid items-center gap-10 py-12 lg:grid-cols-[1fr_1fr] lg:py-20">
          <div className="text-center lg:text-left">
            <p className="mb-5 inline-flex items-center gap-2 text-xs font-bold tracking-[0.2em] text-[#9a6b43] uppercase">
              <IconSparkles className="size-4" /> {t('wedding.eyebrow')}
            </p>
            <h1 className={`${SERIF} text-[2.5rem] leading-[1.1] font-semibold text-brand-navy sm:text-5xl lg:text-[3.6rem]`}>
              {t('wedding.titleLead')} <span className="text-[#f91570] italic">{t('wedding.titleHighlight')}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-brand-navy/70 sm:text-lg lg:mx-0">{t('wedding.subtitle')}</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Button size="lg" variant="brand" asChild>
                <a href="#collection">
                  {t('wedding.ctaBrowse')} <IconArrowRight />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="border-[#d9c3ab] bg-transparent hover:bg-white/60" asChild>
                <Link to="/contact">{t('wedding.ctaCustom')}</Link>
              </Button>
            </div>
          </div>
          <InvitationVisual />
        </div>
      </section>

      <section id="collection" className="container-page scroll-mt-24 section-y">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <Flourish className="mb-4" />
          <h2 className={`${SERIF} text-3xl font-semibold text-brand-navy sm:text-4xl`}>{t('wedding.collectionTitle')}</h2>
          <p className="mt-3 text-brand-navy/65">{t('wedding.collectionSubtitle')}</p>
        </div>
        <InfiniteProductGrid category={CATEGORY} />
      </section>

      <section className="border-y border-[#ecdfd0] bg-white section-y">
        <div className="container-page">
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2 className={`${SERIF} text-3xl font-semibold text-brand-navy sm:text-4xl`}>{t('wedding.detailsTitle')}</h2>
            <p className="mt-3 text-brand-navy/65">{t('wedding.detailsSubtitle')}</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {details.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-xl shadow-card border-[#ecdfd0] bg-[#fbf7f2] p-6 text-center">
                <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-muted border-[#d9b48f] text-[#9a6b43]">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-bold text-brand-navy">{title}</h3>
                <p className="mt-1.5 text-sm text-brand-navy/65">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page section-y">
        <h2 className={`${SERIF} mb-12 text-center text-3xl font-semibold text-brand-navy sm:text-4xl`}>{t('wedding.stepsTitle')}</h2>
        <ol className="relative grid gap-8 md:grid-cols-4 md:gap-6">
          {/* Thread connecting the steps on wide screens. */}
          <span className="absolute top-5 right-[12.5%] left-[12.5%] hidden h-px bg-[#d9b48f] md:block" aria-hidden />
          {steps.map(({ title, desc }, i) => (
            <li key={title} className="relative flex gap-4 md:flex-col md:items-center md:text-center">
              <span className={`${SERIF} relative grid size-10 shrink-0 place-items-center rounded-full bg-brand-navy text-lg text-white italic ring-4 ring-[#fbf7f2]`}>
                {i + 1}
              </span>
              <div>
                <h3 className="font-bold text-brand-navy">{title}</h3>
                <p className="mt-1 text-sm text-brand-navy/65">{desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="container-page">
        <div className="relative overflow-hidden rounded-2xl bg-brand-navy px-6 py-14 text-center text-white sm:px-12">
          <div className="absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-[#b8875b]/30 blur-3xl" />
          <div className="relative mx-auto max-w-xl">
            <Flourish className="mb-5 text-[#d9b48f]" />
            <h2 className={`${SERIF} text-3xl font-semibold sm:text-4xl`}>{t('wedding.ctaTitle')}</h2>
            <p className="mt-3 text-white/75">{t('wedding.ctaSubtitle')}</p>
            <Button size="lg" variant="brand" className="mt-7" asChild>
              <Link to="/contact">
                {t('wedding.ctaCustom')} <IconArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
