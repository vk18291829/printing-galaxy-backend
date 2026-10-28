import { IconRefresh } from '@tabler/icons-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';

/**
 * After a release the old build files are gone, so a tab (or the installed app) opened before it
 * can't load the next page ("Failed to fetch dynamically imported module"). Reloading picks up the
 * new release. Once per 10 seconds at most, so a real outage can't cause a reload loop.
 */
const KEY = 'pg-stale-reload';

export const isStaleBuildError = (error: unknown) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(
    String((error as Error | undefined)?.message ?? error),
  );

function reloadOnce() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 10_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // No session storage: still reload, the browser cache makes a second miss unlikely.
  }
  window.location.reload();
  return true;
}

/** Vite reports a failed page download here first; reloading quietly avoids the error screen. */
export function handleStaleBuilds() {
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnce()) event.preventDefault();
  });
}

/** Error screen for the router: reloads into the new release, or offers a way out for real errors. */
export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();
  const stale = isStaleBuildError(error);
  useEffect(() => {
    if (stale) reloadOnce();
  }, [stale]);

  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 text-center">
      <div className="max-w-sm">
        <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-secondary text-primary">
          <IconRefresh className="size-7" />
        </span>
        <h1 className="text-xl font-bold">{t(stale ? 'appError.updatedTitle' : 'appError.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t(stale ? 'appError.updatedDesc' : 'appError.desc')}</p>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          <Button onClick={() => window.location.reload()}>
            <IconRefresh /> {t('appError.reload')}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/" reloadDocument>
              {t('appError.home')}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
