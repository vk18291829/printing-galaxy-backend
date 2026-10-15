import { IconMoon, IconSun } from '@tabler/icons-react';
import { useTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === 'dark' ? 'light' : 'dark';
  return (
    <Button variant="ghost" size="icon" className="size-9" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`}>
      {resolvedTheme === 'dark' ? <IconSun className="size-[18px]" /> : <IconMoon className="size-[18px]" />}
    </Button>
  );
}
