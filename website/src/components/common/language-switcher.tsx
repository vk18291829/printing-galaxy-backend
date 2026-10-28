import { IconWorld } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useSetLanguage } from './language-prompt';

/** Segmented EN / हि pill for the navy top bar; the active language gets the orange chip. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const setLanguage = useSetLanguage();

  return (
    <div role="group" aria-label={t('nav.language')} className={cn('flex shrink-0 items-center gap-1.5', className)}>
      <IconWorld className="size-3.5 text-white/55" aria-hidden />
      <div className="flex items-center rounded-full bg-white/10 p-0.5 ring-1 ring-white/15">
        {LANGUAGES.map((l) => {
          const active = i18n.language === l.code;
          return (
            <button
              key={l.code}
              type="button"
              lang={l.code}
              aria-pressed={active}
              title={l.label}
              onClick={() => !active && setLanguage(l.code)}
              className={cn(
                'h-6 min-w-9 rounded-full px-2.5 text-[11px] leading-none font-bold transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none',
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-white/70 hover:text-white',
              )}
            >
              {l.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}
