import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The light blue band at the top of a page (same look as the profile and order headers): an optional
 * icon, an eyebrow, the title, a line under it, and actions or extra content on the right.
 */
export function PageBanner({
  icon,
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Shown under the heading row, inside the band (stats, a search box…). */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('light-band rounded-3xl p-6 sm:p-8', className)}>
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {icon && (
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-navy text-white [&_svg]:size-6">{icon}</span>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="text-[11px] font-semibold tracking-[0.14em] text-primary/70 uppercase">{eyebrow}</p>}
            <h1 className="text-2xl font-bold tracking-tight break-words text-brand-navy sm:text-3xl">{title}</h1>
            {description && <div className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</div>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children && <div className="relative mt-6">{children}</div>}
    </section>
  );
}
