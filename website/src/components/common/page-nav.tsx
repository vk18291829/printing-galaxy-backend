import { IconArrowLeft } from '@tabler/icons-react';
import { Fragment } from 'react';
import { Link } from 'react-router';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  /** Omitted for the current page. */
  to?: string;
}

/**
 * Where-am-I navigation used on every inner page: a breadcrumb trail on desktop, a single
 * back link to the parent page on phones and tablets.
 */
export function PageNav({ items, className }: { items: Crumb[]; className?: string }) {
  const parent = [...items].reverse().find((c) => c.to);
  return (
    <div className={cn('mb-6', className)}>
      {parent?.to && (
        <Link
          to={parent.to}
          className="group inline-flex h-9 items-center gap-2 rounded-full border bg-card py-1 pl-1 pr-3.5 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <span className="grid size-7 place-items-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <IconArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          </span>
          {parent.label}
        </Link>
      )}
      <Breadcrumb className="hidden lg:block">
        <BreadcrumbList>
          {items.map((c, i) => (
            <Fragment key={`${c.label}-${i}`}>
              {i > 0 && <BreadcrumbSeparator />}
              <BreadcrumbItem>
                {c.to && i < items.length - 1 ? (
                  <BreadcrumbLink asChild>
                    <Link to={c.to}>{c.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{c.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
