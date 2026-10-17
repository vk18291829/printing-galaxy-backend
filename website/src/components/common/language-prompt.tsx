import { IconCheck, IconLanguage } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUpdateAccount } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { chooseLanguage, hasLanguageChoice, LANGUAGES, type Language } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Switches the language, remembers the choice, and saves it to a signed-in customer's account. */
export function useSetLanguage() {
  const principal = useAuthStore((s) => s.principal);
  const update = useUpdateAccount();
  return (lng: Language) => {
    void chooseLanguage(lng);
    if (principal?.kind === 'user' && principal.user.language !== lng) update.mutate({ language: lng });
  };
}

/**
 * Asks first-time visitors to pick English or Hindi. A signed-in customer's saved language
 * always wins, so the site follows them across devices.
 */
export function LanguagePrompt() {
  const { i18n } = useTranslation();
  const principal = useAuthStore((s) => s.principal);
  const status = useAuthStore((s) => s.status);
  const setLanguage = useSetLanguage();
  const [open, setOpen] = useState(false);
  const applied = useRef<string | null>(null);

  // Apply the account's language once per sign-in.
  const accountLanguage = principal?.kind === 'user' ? principal.user.language : undefined;
  const accountId = principal?.kind === 'user' ? principal.user._id : null;
  useEffect(() => {
    if (!accountId || !accountLanguage || applied.current === accountId) return;
    applied.current = accountId;
    void chooseLanguage(accountLanguage);
    setOpen(false);
  }, [accountId, accountLanguage]);

  // Wait for the session check so a returning customer is not asked.
  useEffect(() => {
    if (status === 'loading') return;
    if (!hasLanguageChoice() && !accountId) setOpen(true);
  }, [status, accountId]);

  const pick = (lng: Language) => {
    setLanguage(lng);
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Closing without a choice keeps the current language and does not ask again.
        if (!o) pick(i18n.language as Language);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="items-center text-center">
          <span className="mb-1 grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
            <IconLanguage className="size-6" />
          </span>
          <DialogTitle>Choose your language · अपनी भाषा चुनें</DialogTitle>
          <DialogDescription>You can change it any time from the menu. · आप इसे कभी भी मेन्यू से बदल सकते हैं।</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {LANGUAGES.map((l) => {
            const active = i18n.language === l.code;
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => pick(l.code)}
                className={cn(
                  'relative flex h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 text-lg font-semibold transition-colors hover:border-primary hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active ? 'border-primary bg-primary/5' : 'border-border',
                )}
              >
                {active && <IconCheck className="absolute top-2 right-2 size-4 text-primary" />}
                <span className="text-2xl font-bold">{l.code === 'en' ? 'Aa' : 'अ'}</span>
                {l.label}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
