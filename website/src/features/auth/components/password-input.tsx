import { IconEye, IconEyeOff } from '@tabler/icons-react';
import { useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** Password field with a show/hide toggle. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        aria-label={visible ? t('auth.org.hidePassword') : t('auth.org.showPassword')}
        aria-pressed={visible}
      >
        {visible ? <IconEyeOff className="size-4" /> : <IconEye className="size-4" />}
      </button>
    </div>
  );
}

/** 0–4 score: length, letters + digits, mixed case, symbols. */
export function passwordScore(pw: string) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Za-z]/.test(pw) && /\d/.test(pw)) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12) score++;
  return score;
}

export function PasswordStrength({ value }: { value: string }) {
  const { t } = useTranslation();
  const labels = t('auth.org.strength', { returnObjects: true }) as string[];
  const score = passwordScore(value);
  if (!value) return null;
  const color = ['bg-destructive', 'bg-destructive', 'bg-warning', 'bg-success', 'bg-success'][score];
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="grid flex-1 grid-cols-4 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn('h-1 rounded-full', i <= score ? color : 'bg-muted')} />
        ))}
      </div>
      <span className="w-14 text-right text-xs text-muted-foreground">{labels[Math.max(0, score - 1)]}</span>
    </div>
  );
}
