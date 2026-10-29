import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 text-sm font-semibold whitespace-nowrap transition-all duration-200 outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 active:scale-[0.98]",
  {
    variants: {
      variant: {
        // Solid navy (logo colour). Disabled solid buttons turn neutral so their label stays readable.
        default: 'bg-primary text-primary-foreground hover:bg-brand-navy-deep disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100',
        destructive: 'bg-destructive text-white hover:bg-destructive/90 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100',
        // Secondary action: a soft navy-tinted fill (no border, no shadow).
        outline: 'bg-secondary text-secondary-foreground hover:bg-[#dfe7f5]',
        // Destructive action for rows and dialogs (Delete, Remove, Archive).
        danger: 'bg-destructive/8 text-destructive hover:bg-destructive/14',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
        ghost: 'hover:bg-secondary hover:text-secondary-foreground',
        navy: 'bg-primary text-primary-foreground hover:bg-brand-navy-deep disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100',
        link: 'text-primary underline-offset-4 hover:underline',
        // The page's main call to action.
        // Disabled stays recognisably the main button (faded navy, white label) on any background.
        brand: 'bg-primary text-primary-foreground hover:bg-brand-navy-deep disabled:bg-primary/40 disabled:text-white disabled:opacity-100',
      },
      size: {
        default: 'h-11 rounded-xl px-5 has-[>svg]:px-4',
        // Touch screens get at least 40px (44px for icons) so small buttons stay easy to tap.
        sm: 'h-9 gap-1.5 rounded-lg px-3.5 text-[13px] pointer-coarse:h-10 has-[>svg]:px-3',
        lg: 'h-12 rounded-xl px-6 text-[15px] has-[>svg]:px-5',
        icon: 'size-11 rounded-xl',
        'icon-sm': 'size-9 rounded-lg pointer-coarse:size-11',
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
