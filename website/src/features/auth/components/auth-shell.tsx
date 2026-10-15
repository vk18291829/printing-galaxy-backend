import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export function AuthShell({
  title,
  subtitle,
  icon,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-primary/8 to-transparent" />
      <div className={`relative container-page py-12 ${wide ? 'max-w-3xl' : 'max-w-md'}`}>
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-xs [&_svg]:size-7">
            {icon}
          </span>
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 max-w-md text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <Card className="overflow-hidden pt-0">
          <div className="h-1 cmyk-strip" />
          <CardContent className="pt-1">{children}</CardContent>
        </Card>
        {footer && <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}
