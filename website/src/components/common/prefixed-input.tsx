import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Input with a fixed prefix (e.g. "+91") drawn as one field: a single border that reacts to
 * focus and errors, instead of two boxes side by side.
 */
export function PrefixedInput({ prefix, className, ...props }: ComponentProps<'input'> & { prefix: ReactNode }) {
  return (
    <div
      className={cn(
        'flex h-11 w-full items-center overflow-hidden rounded-lg border border-input bg-background shadow-xs transition-colors focus-within:border-foreground/30 has-[input[aria-invalid=true]]:border-destructive dark:bg-input/30',
        className,
      )}
    >
      <span className="flex h-full shrink-0 items-center border-r bg-muted/60 px-3 text-sm font-medium text-muted-foreground select-none">{prefix}</span>
      <input
        className="h-full min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
    </div>
  );
}
