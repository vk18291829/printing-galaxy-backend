import { IconArrowLeft, IconDeviceFloppy, IconEye, IconPhotoPlus, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ErrorState, PageLoader, Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/features/auth/auth-store';
import { CardPreview } from '@/features/institution/card-preview';
import { useCardKinds, useSaveTemplate, useTemplates, type CardKind, type TemplateInput } from '@/features/institution/api';
import { uploadFile } from '@/features/uploads/upload-file';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage } from '@/lib/api-client';
import { fetchFile } from '@/lib/download';
import { cn } from '@/lib/utils';

const MAX_FIELDS = 5;

export default function TemplateEditorPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const { t } = useTranslation();
  const navigate = useNavigate();
  const institution = useAuthStore((s) => (s.principal?.kind === 'institution' ? s.principal.institution : null));
  const { data: kinds, isLoading: kindsLoading } = useCardKinds();
  const { data: templates, isLoading, error } = useTemplates();
  const save = useSaveTemplate();
  const existing = isNew ? undefined : templates?.find((x) => x._id === id);
  useDocumentTitle(t(isNew ? 'templates.new' : 'templates.edit'));

  const [form, setForm] = useState<TemplateInput | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>();
  const [logoUploading, setLogoUploading] = useState(false);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const logoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (form || !kinds) return;
    if (existing) {
      setForm({
        name: existing.name,
        kind: existing.kind,
        orientation: existing.orientation,
        colors: existing.colors,
        headerText: existing.headerText ?? '',
        subText: existing.subText ?? '',
        fields: existing.fields,
        backText: existing.backText ?? '',
        signatureLabel: existing.signatureLabel ?? '',
        validUpto: existing.validUpto ?? '',
      });
      setLogoUrl(existing.logoUrl);
    } else if (isNew) {
      const first = kinds[0]!;
      setForm({
        name: `${first.label} ${new Date().getFullYear()}`,
        kind: first.kind,
        orientation: 'landscape',
        colors: { primary: '#1D6CF0', accent: '#FFC20E', text: '#131A2B' },
        headerText: institution?.name ?? '',
        subText: institution?.address ? [institution.address.line1, institution.address.city].filter(Boolean).join(', ') : '',
        fields: first.defaultFields.slice(0, MAX_FIELDS),
        backText: '',
        signatureLabel: 'Principal',
        validUpto: '',
      });
    }
  }, [kinds, existing, isNew, form, institution]);

  if (isLoading || kindsLoading) return <PageLoader />;
  if (error || (!isNew && templates && !existing)) {
    return (
      <div className="container-page py-16">
        <ErrorState error={error ?? new Error(t('templates.notFound'))} />
      </div>
    );
  }
  if (!form || !kinds) return <PageLoader />;

  const info = kinds.find((k) => k.kind === form.kind)!;
  const set = <K extends keyof TemplateInput>(key: K, value: TemplateInput[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const changeKind = (kind: CardKind) => {
    const next = kinds.find((k) => k.kind === kind)!;
    setForm((f) => (f ? { ...f, kind, fields: next.defaultFields.slice(0, MAX_FIELDS), orientation: kind === 'fee_card' ? 'landscape' : f.orientation } : f));
  };

  const toggleField = (key: string, on: boolean) =>
    set('fields', on ? [...form.fields, key].slice(0, MAX_FIELDS + 1) : form.fields.filter((f) => f !== key));

  async function chooseLogo(file: File) {
    setLogoUploading(true);
    try {
      const up = await uploadFile(file, { purpose: 'logo' });
      set('logoFileId', up._id);
      setLogoUrl(up.publicUrl ?? URL.createObjectURL(file));
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setLogoUploading(false);
    }
  }

  const submit = () =>
    save.mutate(
      { id: isNew ? undefined : id, data: form },
      {
        onSuccess: (saved) => {
          toast.success(t('templates.saved'));
          if (isNew) navigate(`/institution/templates/${saved._id}`, { replace: true });
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );

  const tooMany = form.fields.length > MAX_FIELDS;

  return (
    <div className="container-page py-10">
      <Link to="/institution/templates" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <IconArrowLeft className="size-4" /> {t('templates.title')}
      </Link>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-3xl font-bold">{t(isNew ? 'templates.new' : 'templates.edit')}</h1>
        <div className="flex flex-wrap gap-2">
          {!isNew && (
            <Button
              variant="outline"
              onClick={() =>
                void fetchFile(`/institution/templates/${id}/sample`, { fallbackName: 'sample.pdf', mode: 'open' }).catch((e) => toast.error(getErrorMessage(e)))
              }
            >
              <IconEye /> {t('templates.samplePdf')}
            </Button>
          )}
          <Button variant="brand" onClick={submit} disabled={save.isPending || !form.name.trim() || tooMany}>
            {save.isPending ? <Spinner className="size-4 text-current" /> : <IconDeviceFloppy />} {t('common.save')}
          </Button>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_440px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('templates.basics')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tpl-name">{t('templates.name')}</Label>
                <Input id="tpl-name" value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('templates.kind')}</Label>
                <Select value={form.kind} onValueChange={(v) => changeKind(v as CardKind)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kinds.map((k) => (
                      <SelectItem key={k.kind} value={k.kind}>
                        {t(`templates.kinds.${k.kind}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('templates.orientation')}</Label>
                <div className="flex gap-1.5">
                  {(['landscape', 'portrait'] as const).map((o) => (
                    <button
                      key={o}
                      type="button"
                      disabled={form.kind === 'fee_card' && o === 'portrait'}
                      onClick={() => set('orientation', o)}
                      className={cn(
                        'flex-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40',
                        form.orientation === o ? 'border-primary bg-primary/10 text-primary' : 'hover:border-primary/40',
                      )}
                    >
                      {t(`design.${o}`)}
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('templates.branding')}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>{t('templates.logo')}</Label>
                <div className="flex items-center gap-3">
                  <span className="grid size-14 place-items-center overflow-hidden rounded-lg border bg-white">
                    {logoUrl ? <img src={logoUrl} alt="" className="size-full object-contain" /> : <IconPhotoPlus className="size-6 text-muted-foreground" />}
                  </span>
                  <Button type="button" variant="outline" size="sm" disabled={logoUploading} onClick={() => logoInput.current?.click()}>
                    {logoUploading && <Spinner className="size-4" />} {t('templates.chooseLogo')}
                  </Button>
                  {logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={t('common.remove')}
                      onClick={() => {
                        set('logoFileId', null);
                        setLogoUrl(undefined);
                      }}
                    >
                      <IconX />
                    </Button>
                  )}
                  <input
                    ref={logoInput}
                    type="file"
                    hidden
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void chooseLogo(f);
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{t('templates.logoHint')}</p>
              </div>
              {(['primary', 'accent', 'text'] as const).map((c) => (
                <div key={c} className="space-y-1.5">
                  <Label htmlFor={`c-${c}`}>{t(`templates.colors.${c}`)}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      id={`c-${c}`}
                      type="color"
                      value={form.colors[c]}
                      onChange={(e) => set('colors', { ...form.colors, [c]: e.target.value.toUpperCase() })}
                      className="h-10 w-12 cursor-pointer rounded-lg border bg-transparent p-1"
                    />
                    <Input
                      value={form.colors[c]}
                      maxLength={7}
                      className="font-mono uppercase"
                      onChange={(e) => /^#[0-9a-fA-F]{0,6}$/.test(e.target.value) && set('colors', { ...form.colors, [c]: e.target.value.toUpperCase() })}
                    />
                  </div>
                </div>
              ))}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tpl-header">{t('templates.headerText')}</Label>
                <Input id="tpl-header" value={form.headerText} maxLength={80} placeholder={institution?.name} onChange={(e) => set('headerText', e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tpl-sub">{t('templates.subText')}</Label>
                <Input id="tpl-sub" value={form.subText} maxLength={140} placeholder={t('templates.subTextPlaceholder')} onChange={(e) => set('subText', e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('templates.details')}</CardTitle>
              <p className="text-sm text-muted-foreground">{t('templates.detailsHint', { count: MAX_FIELDS })}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {info.allowedFields.map((f) => {
                  const checked = form.fields.includes(f.key);
                  return (
                    <label key={f.key} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-sm', checked && 'border-primary/50 bg-primary/5')}>
                      <Checkbox checked={checked} disabled={!checked && form.fields.length >= MAX_FIELDS} onCheckedChange={(v) => toggleField(f.key, v === true)} />
                      {t(`templates.fieldNames.${f.key}`, { defaultValue: f.label })}
                    </label>
                  );
                })}
              </div>
              {tooMany && <p className="text-sm text-destructive">{t('templates.tooMany', { count: MAX_FIELDS })}</p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-sign">{t('templates.signature')}</Label>
                  <Input id="tpl-sign" value={form.signatureLabel} maxLength={40} onChange={(e) => set('signatureLabel', e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-valid">{t('templates.validUpto')}</Label>
                  <Input id="tpl-valid" value={form.validUpto} maxLength={30} placeholder="March 2027" onChange={(e) => set('validUpto', e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-back">{t('templates.backText')}</Label>
                <Textarea id="tpl-back" value={form.backText} maxLength={400} placeholder={t('templates.backTextPlaceholder')} onChange={(e) => set('backText', e.target.value)} />
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="flex gap-1 rounded-xl border bg-card p-1">
            {(['front', 'back'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={cn('flex-1 rounded-lg px-3 py-1.5 text-sm font-medium', side === s ? 'bg-primary/10 text-primary' : 'text-muted-foreground')}
              >
                {t(s === 'front' ? 'crop.front' : 'crop.back')}
              </button>
            ))}
          </div>
          <div className="grid place-items-center rounded-2xl bg-muted/50 p-6">
            <CardPreview
              info={info}
              side={side}
              className={form.orientation === 'portrait' ? 'w-3/5' : 'w-full'}
              template={{ ...form, logoUrl }}
            />
          </div>
          <p className="text-center text-xs text-muted-foreground">
            {t('templates.previewNote', { w: info.size.w / 10, h: info.size.h / 10 })}
          </p>
        </aside>
      </div>
    </div>
  );
}
