import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <Link to="/" className={cn('group flex items-center gap-2.5', className)} aria-label="Printing Galaxy home">
      <span className="grid size-10 place-items-center rounded-xl bg-white shadow-sm ring-1 ring-black/5 transition-transform group-hover:scale-105 dark:ring-white/10">
        <img src="/logo.png" alt="" className="size-8 object-contain" width={32} height={32} />
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-[1.05rem] font-bold tracking-tight">
            Printing <span className="text-brand-gradient">Galaxy</span>
          </span>
          <span className="mt-1 hidden h-[3px] w-full rounded-full cmyk-strip sm:block" />
        </span>
      )}
    </Link>
  );
}
