import { IconAlertCircle, IconMailOff } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { api } from '@/lib/api-client';

/** Target of the "Stop offer emails" link: works without signing in, the link itself is signed. */
export default function UnsubscribePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('unsubscribe.title'));
  const [params] = useSearchParams();
  const u = params.get('u') ?? '';
  const token = params.get('t') ?? '';
  const stop = useMutation({ mutationFn: () => api.post('/marketing/unsubscribe', { u, t: token }) });

  useEffect(() => {
    if (u && token) stop.mutate();
    // Runs once for the link that was opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [u, token]);

  const failed = !u || !token || stop.isError;
  return (
    <div className="container-page max-w-md py-16">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary [&_svg]:size-6">
            {failed ? <IconAlertCircle /> : <IconMailOff />}
          </span>
          {failed ? (
            <p className="text-lg font-semibold">{t('unsubscribe.failed')}</p>
          ) : stop.isSuccess ? (
            <>
              <p className="text-lg font-semibold">{t('unsubscribe.done')}</p>
              <p className="text-sm text-muted-foreground">{t('unsubscribe.doneDesc')}</p>
            </>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground">
              <Spinner className="size-4" /> {t('unsubscribe.working')}
            </p>
          )}
          <Button variant="outline" className="mt-2" asChild>
            <Link to="/">{t('unsubscribe.home')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
