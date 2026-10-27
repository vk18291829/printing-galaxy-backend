import {
  IconCheck,
  IconDeviceMobile,
  IconFileInvoice,
  IconIdBadge2,
  IconPackage,
  IconReceipt2,
  IconShieldCheck,
  IconTruckDelivery,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type AuthAudience = 'institution' | 'individual';

const PANEL = {
  institution: { key: 'auth.org', icons: [IconReceipt2, IconIdBadge2, IconShieldCheck, IconFileInvoice], glow: 'bg-primary/25' },
  individual: { key: 'auth.person', icons: [IconDeviceMobile, IconReceipt2, IconPackage, IconTruckDelivery], glow: 'bg-brand-cyan/35' },
} as const;

/** Brand panel shown beside the form on large screens. */
function BrandPanel({ audience, brief }: { audience: AuthAudience; brief?: boolean }) {
  const { t } = useTranslation();
  const { key, icons, glow } = PANEL[audience];
  const benefits = t(`${key}.benefits`, { returnObjects: true }) as string[];
  const steps = t(`${key}.approvalSteps`, { returnObjects: true }) as string[];

  if (brief) {
    return (
      <aside className="relative hidden overflow-hidden bg-brand-navy text-white lg:flex lg:flex-col">
        <div className={cn('pointer-events-none absolute -top-32 -left-24 size-96 rounded-full blur-3xl', glow)} />
        <div className="relative flex flex-1 flex-col justify-center gap-6 p-10 xl:p-12">
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">{t(`${key}.eyebrow`)}</p>
          <h2 className="max-w-sm text-3xl leading-tight font-bold text-balance">{t(`${key}.heroTitle`)}</h2>
          <ul className="grid max-w-sm gap-3 text-sm text-white/80">
            {benefits.slice(0, 3).map((b) => (
              <li key={b} className="flex items-center gap-2.5">
                <IconCheck className="size-4 shrink-0 text-primary" /> {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative h-1 bg-primary" />
      </aside>
    );
  }

  return (
    <aside className="relative hidden overflow-hidden bg-brand-navy text-white lg:flex lg:flex-col">
      <div className={cn('pointer-events-none absolute -top-32 -left-24 size-96 rounded-full blur-3xl', glow)} />
      <div className="pointer-events-none absolute -right-24 bottom-0 size-80 rounded-full bg-brand-magenta/25 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(#fff_1px,transparent_1px),linear-gradient(90deg,#fff_1px,transparent_1px)] [background-size:40px_40px]" />

      <div className="relative flex flex-1 flex-col justify-between gap-10 p-10 xl:p-12">
        <div className="space-y-8">
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-[0.14em] text-brand-yellow uppercase">{t(`${key}.eyebrow`)}</p>
            <h2 className="max-w-md text-3xl leading-tight font-bold text-balance">{t(`${key}.heroTitle`)}</h2>
            <p className="max-w-md text-white/70">{t(`${key}.heroSubtitle`)}</p>
          </div>
          <ul className="grid max-w-md gap-2.5">
            {benefits.map((b, i) => {
              const Icon = icons[i % icons.length]!;
              return (
                <li key={b} className="flex items-center gap-3 rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10">
                  <Icon className="size-5 shrink-0 text-brand-cyan" />
                  <span className="text-sm">{b}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-medium text-white/50">{t(`${key}.howApprovalWorks`)}</p>
          <ol className="grid gap-2 text-sm">
            {steps.map((s, i) => (
              <li key={s} className="flex items-center gap-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold">{i + 1}</span>
                <span className="text-white/80">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <div className="relative h-1 cmyk-strip" />
    </aside>
  );
}

/**
 * Split card for sign-in and registration: brand panel on the left (large screens), form on the
 * right. Sits inside the page container so its edges line up with the header.
 */
export function OrgAuthLayout({
  title,
  subtitle,
  children,
  footer,
  header,
  wide = false,
  audience = 'institution',
  brief = false,
}: {
  title: string;
  /** Shown above the title, e.g. the sign-in page's account-type tabs. */
  header?: ReactNode;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  audience?: AuthAudience;
  /** Sign-in: a shorter brand panel (headline and three points). */
  brief?: boolean;
}) {
  return (
    <div className="container-page py-6 sm:py-10">
      <div className={cn('grid overflow-hidden rounded-2xl shadow-card bg-card lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]', !brief && 'lg:min-h-[640px]')}>
        <BrandPanel audience={audience} brief={brief} />
        <div className="flex items-start justify-center px-5 py-8 sm:px-10 sm:py-12 lg:items-center lg:px-14">
          <div className={cn('w-full', wide ? 'max-w-xl' : 'max-w-sm')}>
            {header}
            <div className="mb-8 space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">{title}</h1>
              {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {children}
            {footer && <div className="mt-8 space-y-2 border-t pt-6 text-sm text-muted-foreground">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Small checklist used on phones, where the brand panel is hidden. */
export function OrgBenefitsInline({ audience = 'institution' }: { audience?: AuthAudience }) {
  const { t } = useTranslation();
  const benefits = t(`${PANEL[audience].key}.benefits`, { returnObjects: true }) as string[];
  return (
    <ul className="mb-8 grid gap-2 rounded-xl shadow-card bg-muted/40 p-4 text-sm lg:hidden">
      {benefits.slice(0, 3).map((b) => (
        <li key={b} className="flex items-center gap-2">
          <IconCheck className="size-4 shrink-0 text-success" /> {b}
        </li>
      ))}
    </ul>
  );
}

/** Numbered progress for multi-step forms; finished steps can be revisited. */
export function AuthStepper({ step, labels, onJump }: { step: number; labels: string[]; onJump?: (i: number) => void }) {
  return (
    <ol className="mb-8 flex items-center gap-2">
      {labels.map((label, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <button
              type="button"
              disabled={!done || !onJump}
              onClick={() => onJump?.(i)}
              aria-current={current ? 'step' : undefined}
              className="flex items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default"
            >
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors',
                  done && 'bg-primary text-primary-foreground',
                  current && 'bg-primary/12 text-primary ring-2 ring-primary',
                  !done && !current && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <IconCheck className="size-4" /> : i + 1}
              </span>
              <span className={cn('hidden text-sm sm:block', current ? 'font-semibold' : 'text-muted-foreground')}>{label}</span>
            </button>
            {i < labels.length - 1 && <span className={cn('h-px min-w-4 flex-1', done ? 'bg-primary' : 'bg-border')} />}
          </li>
        );
      })}
    </ol>
  );
}
