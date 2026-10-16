import { IconDownload, IconFileSpreadsheet, IconFileZip, IconLoader2, IconPlus, IconUpload, IconX } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { PageNav } from '@/components/common/page-nav';
import { EmptyState, PageLoader, Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sampleCsv, useCardKinds, useCreateBulkJob, useTemplates } from '@/features/institution/api';
import { deleteUpload, uploadFile } from '@/features/uploads/upload-file';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage } from '@/lib/api-client';
import { formatFileSize } from '@/lib/format';

interface Uploaded {
  id: string;
  name: string;
  size: number;
}

function SingleFile({
  accept,
  icon,
  label,
  hint,
  value,
  onChange,
}: {
  accept: string[];
  icon: React.ReactNode;
  label: string;
  hint: string;
  value: Uploaded | null;
  onChange: (f: Uploaded | null) => void;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);

  async function pick(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!accept.includes(ext)) {
      toast.error(`${file.name}: ${t('upload.typeNotAllowed')}`);
      return;
    }
    setProgress(0);
    try {
      const up = await uploadFile(file, { purpose: 'bulk', onProgress: setProgress });
      if (value) void deleteUpload(value.id).catch(() => undefined);
      onChange({ id: up._id, name: up.originalName, size: up.size });
    } catch (e) {
      toast.error(`${t('upload.failed')}: ${getErrorMessage(e)}`);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5">
          {icon}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{value.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(value.size)}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={t('common.remove')}
            onClick={() => {
              void deleteUpload(value.id).catch(() => undefined);
              onChange(null);
            }}
          >
            <IconX />
          </Button>
        </div>
      ) : progress !== null ? (
        <div className="space-y-2 rounded-xl border bg-card px-3 py-3">
          <p className="flex items-center gap-2 text-sm">
            <IconLoader2 className="size-4 animate-spin text-primary" /> {progress >= 100 ? t('upload.processing') : `${progress}%`}
          </p>
          <Progress value={progress} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed px-4 py-5 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <IconUpload className="size-5" />
          </span>
          <span className="text-sm">
            <span className="block font-semibold">{t('bulk.chooseFile')}</span>
            <span className="text-muted-foreground">{hint}</span>
          </span>
        </button>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept={accept.map((a) => `.${a}`).join(',')}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void pick(f);
        }}
      />
    </div>
  );
}

export default function BulkUploadPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('bulk.newTitle'));
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: templates, isLoading } = useTemplates();
  const { data: kinds } = useCardKinds();
  const create = useCreateBulkJob();
  const [templateId, setTemplateId] = useState<string>(params.get('template') ?? '');
  const [list, setList] = useState<Uploaded | null>(null);
  const [photos, setPhotos] = useState<Uploaded | null>(null);

  if (isLoading) return <PageLoader />;

  const template = templates?.find((x) => x._id === templateId) ?? (templates?.length === 1 ? templates[0] : undefined);
  const info = kinds?.find((k) => k.kind === template?.kind);
  const needPhotos = Boolean(info?.photoRequired);

  const downloadSample = () => {
    if (!info) return;
    const url = URL.createObjectURL(new Blob([sampleCsv(info)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${info.kind}-list-sample.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  const submit = async () => {
    if (!template || !list) return;
    let jobId = '';
    const ok = await confirmAction({
      title: t('confirm.bulkCreateTitle'),
      description: t('confirm.bulkCreateDesc'),
      confirmLabel: t('confirm.bulkCreate'),
      action: async () => {
        jobId = (await create.mutateAsync({ templateId: template._id, dataFileId: list.id, photosFileId: photos?.id }))._id;
      },
    });
    if (ok && jobId) navigate(`/institution/bulk/${jobId}`);
  };

  return (
    <div className="container-page py-10">
      <PageNav items={[{ label: t('nav.dashboard'), to: '/institution' }, { label: t('bulk.newTitle') }]} />
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('bulk.newTitle')}</h1>
      <p className="mt-1 mb-8 text-muted-foreground">{t('bulk.newSubtitle')}</p>

      {!templates?.length ? (
        <EmptyState
          icon={<IconFileSpreadsheet />}
          title={t('bulk.needTemplate')}
          description={t('bulk.needTemplateDesc')}
          action={
            <Button asChild>
              <Link to="/institution/templates/new">
                <IconPlus /> {t('templates.new')}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-6 *:min-w-0 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>1. {t('bulk.stepTemplate')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Select value={template?._id ?? ''} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('bulk.pickTemplate')} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl._id} value={tpl._id}>
                      {tpl.name} · {t(`templates.kinds.${tpl.kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Link to="/institution/templates/new" className="inline-block text-sm font-medium text-primary hover:underline">
                + {t('templates.new')}
              </Link>
            </CardContent>
          </Card>

          <Card className={template ? '' : 'pointer-events-none opacity-50'}>
            <CardHeader>
              <CardTitle>2. {t('bulk.stepList')}</CardTitle>
              {info && (
                <p className="text-sm text-muted-foreground">
                  {t('bulk.listHint', { columns: info.required.map((c) => t(`templates.fieldNames.${c}`, { defaultValue: c })).join(', ') })}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <Button type="button" variant="outline" size="sm" onClick={downloadSample} disabled={!info}>
                <IconDownload /> {t('bulk.sampleCsv')}
              </Button>
              <SingleFile
                accept={['xlsx', 'csv']}
                icon={<IconFileSpreadsheet className="size-6 text-success" />}
                label={t('bulk.listFile')}
                hint={t('bulk.listFileHint')}
                value={list}
                onChange={setList}
              />
            </CardContent>
          </Card>

          <Card className={template ? '' : 'pointer-events-none opacity-50'}>
            <CardHeader>
              <CardTitle>
                3. {t('bulk.stepPhotos')} {!needPhotos && <span className="text-sm font-normal text-muted-foreground">({t('common.optional')})</span>}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t('bulk.photosHint', { id: info ? t(`templates.fieldNames.${info.idField}`, { defaultValue: info.idField }) : '' })}</p>
            </CardHeader>
            <CardContent>
              <SingleFile
                accept={['zip']}
                icon={<IconFileZip className="size-6 text-primary" />}
                label={t('bulk.photosFile')}
                hint={t('bulk.photosFileHint')}
                value={photos}
                onChange={setPhotos}
              />
            </CardContent>
          </Card>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:col-span-3">
          <Button size="lg" variant="brand" className="w-full sm:w-auto" disabled={!template || !list || (needPhotos && !photos) || create.isPending} onClick={() => void submit()}>
            {create.isPending && <Spinner className="size-4 text-current" />} {t('bulk.check')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('bulk.privacy')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
