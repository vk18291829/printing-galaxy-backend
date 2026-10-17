import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 active:scale-[0.98]",
  {
    variants: {
      variant: {
        // Disabled solid buttons turn neutral instead of fading, so their label stays readable.
        default: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none',
        destructive: 'bg-destructive text-white shadow-sm hover:bg-destructive/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none',
        outline: 'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50',
        // Visible destructive action for rows and dialogs (Delete, Remove, Archive).
        danger: 'border border-destructive/40 bg-background text-destructive shadow-xs hover:bg-destructive/10 hover:text-destructive dark:bg-input/30 dark:hover:bg-destructive/15',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
        brand: 'bg-primary text-primary-foreground shadow-sm ring-1 ring-white/10 ring-inset hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none disabled:ring-0',
      },
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 rounded-md px-3 text-xs has-[>svg]:px-2.5',
        lg: 'h-12 rounded-xl px-6 text-base has-[>svg]:px-5',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
