import { IconArrowRight, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Home page block: heading with an optional "View all" link, then its content. */
export function Section({
  title,
  subtitle,
  viewAll,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  viewAll?: string;
  children: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <section className={cn('container-page py-8 sm:py-10', className)}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl font-bold tracking-tight text-brand-navy sm:text-[1.75rem]">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {viewAll && (
          <Button variant="outline" size="sm" className="shrink-0" asChild>
            <Link to={viewAll}>
              {t('common.viewAll')} <IconArrowRight />
            </Link>
          </Button>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Horizontal scroll-snap row. Touch users swipe; on desktop, arrow buttons page through it.
 * `itemClassName` sets the card width per breakpoint.
 */
export function Rail({ children, itemClassName, label }: { children: ReactNode[]; itemClassName: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: 'smooth' });

  return (
    <div className="group/rail relative">
      <div
        ref={ref}
        role="region"
        aria-label={label}
        className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0"
      >
        {children.map((child, i) => (
          <div key={i} className={cn('shrink-0 snap-start', itemClassName)}>
            {child}
          </div>
        ))}
      </div>
      {[-1, 1].map((dir) => (
        <Button
          key={dir}
          variant="outline"
          size="icon"
          aria-label={dir < 0 ? 'Previous' : 'Next'}
          onClick={() => scroll(dir as 1 | -1)}
          className={cn(
            'absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 rounded-full bg-background/95 opacity-0 shadow-md transition-opacity group-hover/rail:opacity-100 focus-visible:opacity-100 lg:inline-flex',
            dir < 0 ? '-left-4' : '-right-4',
          )}
        >
          {dir < 0 ? <IconChevronLeft /> : <IconChevronRight />}
        </Button>
      ))}
    </div>
  );
}
