import { IconAlertTriangle, IconLoader2 } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <IconLoader2 className={cn('size-5 animate-spin text-primary', className)} />;
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Spinner className="size-8" />
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed bg-card p-10 text-center">
      <IconAlertTriangle className="size-8 text-destructive" />
      <p className="font-semibold">Something went wrong</p>
      <p className="max-w-sm text-sm text-muted-foreground">{getErrorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary [&_svg]:size-6">{icon}</div>
      <p className="font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** A small icon chip before the title. */
  icon?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && (
          <span className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-navy text-white [&_svg]:size-5.5">{icon}</span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy sm:text-[1.75rem] dark:text-foreground">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A heading inside a card: an icon chip, the title and an optional line under it. */
export function SectionTitle({ icon, title, description }: { icon: ReactNode; title: ReactNode; description?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary [&_svg]:size-4.5">{icon}</span>
      <div className="min-w-0 pt-0.5">
        <p className="text-[15px] leading-tight font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}
