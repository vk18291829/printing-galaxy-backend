import { IconId, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { PageNav } from '@/components/common/page-nav';
import { EmptyState, ErrorState, PageLoader } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CardPreview } from '@/features/institution/card-preview';
import { useCardKinds, useDeleteTemplate, useTemplates } from '@/features/institution/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { formatDate } from '@/lib/format';

export default function TemplatesPage() {
  const { t, i18n } = useTranslation();
  useDocumentTitle(t('templates.title'));
  const { data: templates, isLoading, error, refetch } = useTemplates();
  const { data: kinds } = useCardKinds();
  const remove = useDeleteTemplate();

  if (isLoading) return <PageLoader />;

  return (
    <div className="container-page py-10">
      <PageNav items={[{ label: t('nav.dashboard'), to: '/institution' }, { label: t('templates.title') }]} />
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('templates.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('templates.subtitle')}</p>
        </div>
        <Button variant="brand" asChild>
          <Link to="/institution/templates/new">
            <IconPlus /> {t('templates.new')}
          </Link>
        </Button>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : !templates?.length ? (
        <EmptyState
          icon={<IconId />}
          title={t('templates.empty')}
          description={t('templates.emptyDesc')}
          action={
            <Button asChild>
              <Link to="/institution/templates/new">
                <IconPlus /> {t('templates.new')}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((tpl) => {
            const info = kinds?.find((k) => k.kind === tpl.kind);
            return (
              <Card key={tpl._id} className="gap-4 overflow-hidden pt-0">
                <div className="grid place-items-center bg-muted/50 p-6">
                  {info && (
                    <CardPreview
                      info={info}
                      side="front"
                      className={tpl.orientation === 'portrait' ? 'w-1/2' : 'w-full'}
                      template={{
                        kind: tpl.kind,
                        orientation: tpl.orientation,
                        colors: tpl.colors,
                        headerText: tpl.headerText ?? '',
                        subText: tpl.subText ?? '',
                        fields: tpl.fields,
                        backText: tpl.backText ?? '',
                        signatureLabel: tpl.signatureLabel ?? '',
                        validUpto: tpl.validUpto ?? '',
                        logoUrl: tpl.logoUrl,
                      }}
                    />
                  )}
                </div>
                <CardContent className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{tpl.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`templates.kinds.${tpl.kind}`)} · {formatDate(tpl.updatedAt, i18n.language)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="outline" size="icon" asChild aria-label={t('common.edit')}>
                      <Link to={`/institution/templates/${tpl._id}`}>
                        <IconPencil />
                      </Link>
                    </Button>
                    <Button
                      variant="danger"
                      size="icon"
                      aria-label={t('common.remove')}
                      disabled={remove.isPending}
                      onClick={() =>
                        void confirmAction({
                          tone: 'danger',
                          title: t('templates.deleteConfirm', { name: tpl.name }),
                          description: t('confirm.templateDeleteDesc'),
                          confirmLabel: t('confirm.deleteTemplate'),
                          action: () => remove.mutateAsync(tpl._id),
                          successTitle: t('confirm.templateDeleted'),
                        })
                      }
                    >
                      <IconTrash />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
