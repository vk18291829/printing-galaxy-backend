import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/hooks/use-document-title';

export default function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('notFound.title'));
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <p className="text-8xl font-bold text-brand-gradient">404</p>
      <div className="my-6 h-1.5 w-32 rounded-full cmyk-strip" />
      <h1 className="text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="mt-2 max-w-md text-muted-foreground">{t('notFound.desc')}</p>
      <Button className="mt-8" asChild>
        <Link to="/">{t('notFound.home')}</Link>
      </Button>
    </div>
  );
}
