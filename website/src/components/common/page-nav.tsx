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
        <Link to={parent.to} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground lg:hidden">
          <IconArrowLeft className="size-4" /> {parent.label}
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
