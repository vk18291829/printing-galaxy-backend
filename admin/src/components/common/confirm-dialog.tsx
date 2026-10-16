import { IconAlertTriangle, IconCircleCheck, IconHelpCircle, IconX } from '@tabler/icons-react';
import { useEffect, type ReactNode } from 'react';
import { create } from 'zustand';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';

export interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for deletes and other changes that are hard to undo. */
  tone?: 'default' | 'danger';
  /** Runs after the user confirms; the dialog shows progress, then success or the error. */
  action?: () => Promise<unknown>;
  successTitle?: string;
  successDescription?: ReactNode;
}

type Phase = 'ask' | 'running' | 'done' | 'error';

interface ConfirmState {
  options: ConfirmOptions | null;
  phase: Phase;
  error: string;
  resolve: ((ok: boolean) => void) | null;
  open: (options: ConfirmOptions, resolve: (ok: boolean) => void) => void;
  set: (patch: Partial<Pick<ConfirmState, 'phase' | 'error'>>) => void;
  close: (ok: boolean) => void;
}

const useConfirmStore = create<ConfirmState>((set, get) => ({
  options: null,
  phase: 'ask',
  error: '',
  resolve: null,
  open: (options, resolve) => {
    get().resolve?.(false);
    set({ options, resolve, phase: 'ask', error: '' });
  },
  set: (patch) => set(patch),
  close: (ok) => {
    get().resolve?.(ok);
    set({ options: null, resolve: null, phase: 'ask', error: '' });
  },
}));

/**
 * Asks before an action and reports how it went. Resolves true once the action succeeded
 * (or, without an action, once the user confirmed); false if cancelled or it failed.
 */
export function confirmAction(options: ConfirmOptions) {
  return new Promise<boolean>((resolve) => useConfirmStore.getState().open(options, resolve));
}

const AUTO_CLOSE_MS = 1600;

/** Mount once near the app root. */
export function ConfirmHost() {
  const { options, phase, error, set, close } = useConfirmStore();

  useEffect(() => {
    if (phase !== 'done') return;
    const id = window.setTimeout(() => close(true), AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [phase, close]);

  if (!options) return null;
  const danger = options.tone === 'danger';
  const busy = phase === 'running';

  const run = async () => {
    if (!options.action) return close(true);
    set({ phase: 'running', error: '' });
    try {
      await options.action();
      set({ phase: 'done' });
    } catch (e) {
      set({ phase: 'error', error: getErrorMessage(e) });
    }
  };

  const icon =
    phase === 'done' ? (
      <IconCircleCheck className="size-6" />
    ) : phase === 'error' ? (
      <IconX className="size-6" />
    ) : danger ? (
      <IconAlertTriangle className="size-6" />
    ) : (
      <IconHelpCircle className="size-6" />
    );

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && close(phase === 'done')}>
      <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-md" onEscapeKeyDown={(e) => busy && e.preventDefault()} onPointerDownOutside={(e) => busy && e.preventDefault()}>
        <div className="flex gap-4 p-6">
          <span
            className={cn(
              'grid size-11 shrink-0 place-items-center rounded-full',
              phase === 'done' && 'bg-success/14 text-success',
              (phase === 'error' || (danger && phase !== 'done')) && 'bg-destructive/12 text-destructive',
              !danger && (phase === 'ask' || phase === 'running') && 'bg-primary/10 text-primary',
            )}
          >
            {icon}
          </span>
          <div className="min-w-0 space-y-1.5 pt-1">
            <DialogTitle className="text-base">
              {phase === 'done' ? (options.successTitle ?? 'Done') : phase === 'error' ? 'That didn’t work' : options.title}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-sm text-muted-foreground">
                {phase === 'done' ? options.successDescription : phase === 'error' ? error : options.description}
              </div>
            </DialogDescription>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t bg-muted/40 px-6 py-4 sm:flex-row sm:justify-end">
          {phase === 'done' ? (
            <Button onClick={() => close(true)} autoFocus>
              OK
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => close(false)} disabled={busy}>
                {phase === 'error' ? 'Close' : (options.cancelLabel ?? 'Cancel')}
              </Button>
              <Button variant={danger ? 'destructive' : 'default'} onClick={() => void run()} disabled={busy} autoFocus>
                {busy && <Spinner className="size-4 text-current" />}
                {phase === 'error' ? 'Try again' : (options.confirmLabel ?? 'Confirm')}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
