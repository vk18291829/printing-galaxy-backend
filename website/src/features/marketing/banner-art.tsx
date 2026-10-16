import type { Banner } from '@/types/api';
import { cn } from '@/lib/utils';

const THEME_CLASS: Record<Banner['theme'], string> = {
  blue: 'banner-blue',
  magenta: 'banner-magenta',
  sunset: 'banner-sunset',
  mint: 'banner-mint',
  dark: 'banner-dark',
};

/**
 * Banner background: the uploaded image (with a dark scrim so white text stays readable),
 * otherwise the theme gradient with a faint dot pattern.
 */
export function BannerBackground({ banner, className }: { banner: Banner; className?: string }) {
  return (
    <div className={cn('absolute inset-0', THEME_CLASS[banner.theme] ?? THEME_CLASS.blue, className)} aria-hidden>
      {banner.imageUrl ? (
        <>
          <img src={banner.imageUrl} alt="" className="size-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-r from-black/75 via-black/40 to-black/5" />
        </>
      ) : (
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgb(255_255_255/0.5)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_left,#000,transparent_70%)]" />
      )}
    </div>
  );
}
