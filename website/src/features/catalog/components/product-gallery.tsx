import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import { DynamicIcon } from '@/components/common/dynamic-icon';
import { useLocalized } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Product } from '@/types/api';

/** Main image with thumbnails (up to 5); falls back to the product icon when there are no photos. */
export function ProductGallery({ product, className }: { product: Product; className?: string }) {
  const l = useLocalized();
  const images = product.images.slice(0, 5);
  const [index, setIndex] = useState(0);
  const current = images[Math.min(index, images.length - 1)];
  const go = (delta: number) => setIndex((i) => (i + delta + images.length) % images.length);

  if (!current) {
    return (
      <div className={cn('grid aspect-4/3 place-items-center rounded-xl border bg-muted text-primary', className)}>
        <DynamicIcon name={product.icon} className="size-16" stroke={1.25} />
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="group relative aspect-4/3 overflow-hidden rounded-xl border bg-muted">
        <img src={current} alt={l(product.name)} className="size-full object-cover" />
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous image"
              className="absolute top-1/2 left-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg bg-background/85 text-foreground shadow-sm backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
            >
              <IconChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next image"
              className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-lg bg-background/85 text-foreground shadow-sm backdrop-blur transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
            >
              <IconChevronRight className="size-5" />
            </button>
            <span className="absolute right-2 bottom-2 rounded-md bg-background/85 px-2 py-0.5 text-xs font-medium tabular-nums backdrop-blur">
              {index + 1} / {images.length}
            </span>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Image ${i + 1}`}
              aria-current={i === index}
              className={cn(
                'aspect-4/3 overflow-hidden rounded-lg border-2 transition-all',
                i === index ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100',
              )}
            >
              <img src={src} alt="" loading="lazy" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
