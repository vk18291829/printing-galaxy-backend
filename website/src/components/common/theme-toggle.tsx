import { IconMoon, IconSun } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';

/** One click switches between light and dark. */
export function ThemeToggle() {
  const { t } = useTranslation();
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === 'dark';
  const label = dark ? t('nav.switchToLight') : t('nav.switchToDark');

  return (
    <Button variant="ghost" size="icon" className="relative size-9" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={label} title={label}>
      <IconSun className="size-4.5 scale-100 rotate-0 transition-all duration-300 dark:scale-0 dark:-rotate-90" />
      <IconMoon className="absolute size-4.5 scale-0 rotate-90 transition-all duration-300 dark:scale-100 dark:rotate-0" />
    </Button>
  );
}
