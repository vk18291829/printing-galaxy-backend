import { IconChevronRight } from '@tabler/icons-react';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Breadcrumb(props: ComponentProps<'nav'>) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}

function BreadcrumbList({ className, ...props }: ComponentProps<'ol'>) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn('flex flex-wrap items-center gap-1.5 text-sm break-words text-muted-foreground', className)}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>) {
  return <li data-slot="breadcrumb-item" className={cn('inline-flex items-center gap-1.5', className)} {...props} />;
}

function BreadcrumbLink({ asChild, className, ...props }: ComponentProps<'a'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'a';
  return <Comp data-slot="breadcrumb-link" className={cn('transition-colors hover:text-foreground', className)} {...props} />;
}

function BreadcrumbPage({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn('max-w-64 truncate font-medium text-foreground', className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({ children, className, ...props }: ComponentProps<'li'>) {
  return (
    <li data-slot="breadcrumb-separator" role="presentation" aria-hidden="true" className={cn('[&>svg]:size-3.5', className)} {...props}>
      {children ?? <IconChevronRight />}
    </li>
  );
}

export { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator };
