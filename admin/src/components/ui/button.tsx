import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 outline-none active:scale-[0.98] select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Disabled solid buttons turn neutral instead of fading, so their label stays readable.
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100',
        destructive: 'bg-destructive text-white hover:bg-destructive/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100',
        // Secondary action: a soft navy-tinted fill (no border, no shadow).
        outline: 'bg-secondary text-secondary-foreground hover:bg-[#dfe7f5]',
        // Visible destructive action for rows and dialogs (Delete, Remove, Archive).
        danger: 'bg-destructive/8 text-destructive hover:bg-destructive/14',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        ghost: 'hover:bg-secondary hover:text-secondary-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        brand: 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100',
      },
      size: {
        // Dense for the desk; touch screens (phones, tablets) get 40–44px so buttons stay easy to tap.
        default: 'h-10 rounded-xl px-4 py-2 pointer-coarse:h-11 has-[>svg]:px-3.5',
        sm: 'h-8 gap-1.5 rounded-lg px-3 pointer-coarse:h-10 has-[>svg]:px-2.5',
        lg: 'h-11 rounded-xl px-6 has-[>svg]:px-4',
        icon: 'size-10 rounded-xl pointer-coarse:size-11',
        'icon-sm': 'size-8 rounded-lg pointer-coarse:size-10',
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
