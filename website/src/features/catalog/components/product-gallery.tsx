import { IconChevronLeft, IconChevronRight, IconPlayerPlayFilled } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { SafeImage } from '@/components/common/safe-image';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { parseVideo, type VideoSource } from '@/lib/video';
import type { Product } from '@/types/api';

type Slide = { kind: 'video'; video: VideoSource } | { kind: 'image'; src: string };

/** Video poster with a play button; the player loads only after a tap. */
function VideoSlide({ video, poster, title }: { video: VideoSource; poster?: string; title: string }) {
  const { t } = useTranslation();
  const [playing, setPlaying] = useState(false);
  if (playing) {
    return video.kind === 'file' ? (
      <video src={video.src} controls autoPlay playsInline className="size-full bg-black object-contain" />
    ) : (
      <iframe
        src={video.embed}
        title={title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        className="size-full border-0 bg-black"
      />
    );
  }
  const still = video.thumb ?? poster;
  return (
    <button type="button" onClick={() => setPlaying(true)} className="group/play relative block size-full bg-brand-navy" aria-label={t('product.playVideo')}>
      {still && <img src={still} alt="" className="size-full object-cover opacity-80" />}
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-16 place-items-center rounded-full bg-primary text-white shadow-xl ring-8 ring-white/20 transition-transform group-hover/play:scale-105">
          <IconPlayerPlayFilled className="ml-1 size-7" />
        </span>
      </span>
      <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">{t('product.demoVideo')}</span>
    </button>
  );
}

/** Demo video (when set) then up to 5 images, with thumbnails; the product icon when there is nothing. */
export function ProductGallery({ product, className }: { product: Product; className?: string }) {
  const l = useLocalized();
  const { t } = useTranslation();
  const video = parseVideo(product.videoUrl);
  const slides: Slide[] = [...(video ? [{ kind: 'video' as const, video }] : []), ...product.images.slice(0, 5).map((src) => ({ kind: 'image' as const, src }))];
  const [index, setIndex] = useState(0);
  const current = slides[Math.min(index, slides.length - 1)];
  const go = (delta: number) => setIndex((i) => (i + delta + slides.length) % slides.length);

  if (!current) {
    return (
      <div className={cn('grid aspect-4/3 place-items-center rounded-xl shadow-card bg-muted text-primary', className)}>
        <DynamicIcon name={product.icon} className="size-16" stroke={1.25} />
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="group relative aspect-4/3 overflow-hidden rounded-xl shadow-card bg-muted">
        {current.kind === 'video' ? (
          <VideoSlide key={index} video={current.video} poster={product.images[0]} title={l(product.name)} />
        ) : (
          <SafeImage
            src={current.src}
            alt={l(product.name)}
            className="size-full object-cover"
            fallback={
              <div className="grid size-full place-items-center text-primary">
                <DynamicIcon name={product.icon} className="size-16" stroke={1.25} />
              </div>
            }
          />
        )}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous"
              className="absolute top-1/2 left-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg bg-background/85 text-foreground shadow-sm backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
            >
              <IconChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next"
              className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg bg-background/85 text-foreground shadow-sm backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
            >
              <IconChevronRight className="size-5" />
            </button>
            {current.kind === 'image' && (
              <span className="absolute right-2 bottom-2 rounded-md bg-background/85 px-2 py-0.5 text-xs font-medium tabular-nums backdrop-blur">
                {index + 1} / {slides.length}
              </span>
            )}
          </>
        )}
      </div>
      {slides.length > 1 && (
        <div className="grid grid-cols-6 gap-2">
          {slides.map((s, i) => (
            <button
              key={s.kind === 'video' ? 'video' : s.src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={s.kind === 'video' ? t('product.demoVideo') : `Image ${i + 1}`}
              aria-current={i === index}
              className={cn(
                'relative aspect-4/3 overflow-hidden rounded-lg border-2 transition-all',
                i === index ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
              )}
            >
              {s.kind === 'video' ? (
                <>
                  {(s.video.thumb ?? product.images[0]) ? (
                    <img src={s.video.thumb ?? product.images[0]} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <span className="block size-full bg-brand-navy" />
                  )}
                  <span className="absolute inset-0 grid place-items-center bg-black/30 text-white">
                    <IconPlayerPlayFilled className="size-4" />
                  </span>
                </>
              ) : (
                <SafeImage src={s.src} alt="" loading="lazy" className="size-full object-cover" fallback={<span className="block size-full bg-muted" />} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
