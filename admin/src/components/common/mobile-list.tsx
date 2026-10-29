import { IconDots } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * Phone version of an admin table (under 768px): one structured row per record, so the key facts
 * and every action stay reachable without sideways scrolling. Pair it with the table wrapped in
 * `hidden md:block`; both read the same data and call the same handlers.
 */
export function MobileList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('divide-y md:hidden', className)}>{children}</ul>;
}

export interface RowAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export function MobileRow({
  title,
  subtitle,
  trailing,
  meta,
  leading,
  to,
  onClick,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right of the title: an amount, a count or a status. */
  trailing?: ReactNode;
  /** Badges and small details under the title. */
  meta?: ReactNode;
  /** Thumbnail or icon before the text. */
  leading?: ReactNode;
  /** Tapping the row opens this page… */
  to?: string;
  /** …or runs this. */
  onClick?: () => void;
  /** Row actions, in a "⋯" menu. */
  actions?: RowAction[];
}) {
  const body = (
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-sm font-semibold [&>*]:truncate">{title}</div>
          {trailing && <div className="shrink-0 text-right text-sm">{trailing}</div>}
        </div>
        {subtitle && <div className="truncate text-xs text-muted-foreground">{subtitle}</div>}
        {meta && <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-xs text-muted-foreground">{meta}</div>}
      </div>
    </div>
  );
  const visible = actions?.filter(Boolean) ?? [];

  return (
    <li className="flex items-start gap-1 px-4 py-3">
      {to ? (
        <Link to={to} className="-mx-2 -my-1.5 flex min-w-0 flex-1 rounded-lg px-2 py-1.5 active:bg-accent/60">
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" onClick={onClick} className="-mx-2 -my-1.5 flex min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left active:bg-accent/60">
          {body}
        </button>
      ) : (
        body
      )}
      {visible.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="-mr-2 shrink-0" aria-label="Actions">
              <IconDots />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {visible.map((a) => (
              <DropdownMenuItem key={a.label} variant={a.destructive ? 'destructive' : 'default'} disabled={a.disabled} onSelect={a.onSelect}>
                {a.icon}
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
