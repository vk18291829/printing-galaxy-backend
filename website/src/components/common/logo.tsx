import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/** The P mark. `light` swaps in the white-ink file for navy or photo backgrounds. */
export function LogoMark({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <img
      src={light ? '/logo-mark-dark.png?v=3' : '/logo-mark.png?v=3'}
      alt=""
      width={48}
      height={48}
      className={cn('size-12 object-contain', className)}
    />
  );
}

/** Mark + wordmark. `inverted` is for the navy footer and other dark panels. */
export function Logo({ className, compact = false, inverted = false }: { className?: string; compact?: boolean; inverted?: boolean }) {
  return (
    <Link to="/" className={cn('group flex items-center gap-2.5', className)} aria-label="Printing Galaxy home">
      <span className="shrink-0 transition-transform duration-200 group-hover:scale-105">
        <LogoMark light={inverted} className="size-10 sm:size-11" />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className={cn('text-[17px] font-extrabold tracking-tight whitespace-nowrap sm:text-xl', inverted ? 'text-white' : 'text-brand-navy')}>
            Printing <span className={inverted ? 'text-brand-amber' : 'text-logo-gradient'}>Galaxy</span>
          </span>
          <span className={cn('mt-1 hidden text-[8.5px] font-semibold tracking-[0.14em] whitespace-nowrap uppercase sm:block', inverted ? 'text-white/60' : 'text-muted-foreground')}>
            Print · Customize · Create
          </span>
        </span>
      )}
    </Link>
  );
}
