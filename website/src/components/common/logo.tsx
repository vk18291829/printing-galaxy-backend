import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/** The PG mark; the dark-theme file has light ink so it stays visible without a white box. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <>
      <img src="/logo-mark.png" alt="" width={48} height={48} className={cn('size-12 object-contain dark:hidden', className)} />
      <img src="/logo-mark-dark.png" alt="" width={48} height={48} className={cn('hidden size-12 object-contain dark:block', className)} />
    </>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" className={cn('group flex items-center gap-2.5', className)} aria-label="Printing Galaxy home">
      <span className="shrink-0 transition-transform group-hover:scale-105">
        <LogoMark className="size-11 sm:size-12" />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-lg font-bold tracking-tight sm:text-xl">
            Printing <span className="text-brand-gradient">Galaxy</span>
          </span>
          <span className="mt-1.5 hidden h-0.75 w-full rounded-full cmyk-strip sm:block" />
        </span>
      )}
    </Link>
  );
}
