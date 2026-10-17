import { IconAlertTriangle, IconCircleCheck, IconCircleX, IconInfoCircle, IconLoader2, IconX } from '@tabler/icons-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/components/theme-provider';

/**
 * Site notifications: a card in our font and colours that slides up from the bottom, with a
 * coloured edge and icon per type, a large title and an optional detail line underneath.
 * Call sites stay plain sonner: toast.success('Title', { description: 'Detail' }).
 */
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme}
      position="bottom-center"
      offset={24}
      mobileOffset={16}
      gap={10}
      duration={5000}
      visibleToasts={3}
      closeButton
      icons={{
        success: <IconCircleCheck />,
        error: <IconCircleX />,
        warning: <IconAlertTriangle />,
        info: <IconInfoCircle />,
        loading: <IconLoader2 className="animate-spin" />,
        close: <IconX className="size-4" />,
      }}
      style={{ '--width': '440px' } as React.CSSProperties}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'group/toast pointer-events-auto relative flex w-full items-start gap-3.5 overflow-hidden rounded-2xl border border-l-[5px] bg-card p-4 pr-11 font-sans text-card-foreground shadow-[0_18px_50px_-12px_rgb(0_0_0/0.35)] sm:p-5 sm:pr-12 ' +
            'data-[type=success]:border-l-success data-[type=error]:border-l-destructive data-[type=warning]:border-l-warning data-[type=info]:border-l-primary data-[type=loading]:border-l-primary data-[type=default]:border-l-brand-magenta',
          icon:
            'mt-0.5 grid size-10 shrink-0 place-items-center rounded-full [&_svg]:size-[22px] ' +
            'group-data-[type=success]/toast:bg-success/12 group-data-[type=success]/toast:text-success ' +
            'group-data-[type=error]/toast:bg-destructive/12 group-data-[type=error]/toast:text-destructive ' +
            'group-data-[type=warning]/toast:bg-warning/18 group-data-[type=warning]/toast:text-amber-600 dark:group-data-[type=warning]/toast:text-warning ' +
            'group-data-[type=info]/toast:bg-primary/12 group-data-[type=info]/toast:text-primary ' +
            'group-data-[type=loading]/toast:bg-primary/12 group-data-[type=loading]/toast:text-primary',
          content: 'flex min-w-0 flex-1 flex-col gap-1 pt-0.5',
          title: 'text-base leading-snug font-semibold tracking-tight sm:text-[17px]',
          description: 'text-sm leading-relaxed text-muted-foreground',
          closeButton:
            'absolute top-3 right-3 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          actionButton:
            'mt-0.5 shrink-0 self-center rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90',
          cancelButton: 'mt-0.5 shrink-0 self-center rounded-lg border px-3.5 py-2 text-sm font-medium hover:bg-accent',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
