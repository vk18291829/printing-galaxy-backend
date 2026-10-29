import { IconDeviceFloppy, IconTrash } from '@tabler/icons-react';
import { useEffect, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { useBreadcrumbLabel } from '@/components/layout/breadcrumbs';
import { IconPicker } from '@/components/common/icon-picker';
import { ErrorState, PageLoader, Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  useAdminCategories,
  useAdminProduct,
  useDeleteProduct,
  useSaveProduct,
  type AdminProduct,
  type ProductInput,
} from '@/features/catalog/api';
import { ImageListEditor } from '@/features/catalog/components/image-list-editor';
import { VideoEditor } from '@/features/catalog/components/video-editor';
import { OptionsEditor } from '@/features/catalog/components/options-editor';
import { PriceBookEditor } from '@/features/catalog/components/price-book-editor';
import { FILE_TYPES, type ProductFormValues } from '@/features/catalog/components/product-form-types';
import { en } from '@/lib/l10n';
import { cn } from '@/lib/utils';

const loc = (v?: { en?: string; hi?: string }) => ({ en: v?.en ?? '', hi: v?.hi ?? '' });

function toForm(p?: AdminProduct & { category: string | { _id: string } }): ProductFormValues {
  return {
    name: loc(p?.name),
    slug: p?.slug ?? '',
    category: typeof p?.category === 'string' ? p.category : (p?.category?._id ?? ''),
    shortDescription: loc(p?.shortDescription),
    description: loc(p?.description),
    icon: p?.icon ?? 'printer',
    images: p?.images ?? [],
    videoUrl: p?.videoUrl ?? '',
    contactPhone: p?.contactPhone ?? '',
    unit: p?.unit ?? 'piece',
    workflow: p?.workflow ?? 'standard',
    specsText: p?.specs.join(', ') ?? '',
    tagsText: p?.tags?.join(', ') ?? '',
    requiresUpload: p?.requiresUpload ?? false,
    acceptedFileTypes: p?.acceptedFileTypes ?? ['pdf', 'jpg', 'png'],
    uploadHint: loc(p?.uploadHint),
    sensitive: p?.sensitive ?? false,
    options:
      p?.options.map((o) => ({
        key: o.key,
        label: loc(o.label),
        required: o.required,
        values: o.values.map((v) => ({
          value: v.value,
          label: loc(v.label),
          unitDelta: v.unitDelta ?? 0,
          fixedFee: v.fixedFee ?? 0,
          minCopies: v.minCopies ?? null,
          isDefault: v.isDefault,
        })),
      })) ?? [],
    pricing: {
      retail: p?.pricing.retail ?? { enabled: true, minQty: 1, tiers: [{ minQty: 1, unitPrice: 0 }] },
      institution: p?.pricing.institution ?? { enabled: true, minQty: 50, tiers: [{ minQty: 50, unitPrice: 0 }] },
    },
    leadTimeDays: p?.leadTimeDays ?? 1,
    isFeatured: p?.isFeatured ?? false,
    isActive: p?.isActive ?? true,
    sortOrder: p?.sortOrder ?? 0,
  };
}

function toInput(v: ProductFormValues): ProductInput {
  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  return {
    ...v,
    specs: split(v.specsText),
    tags: split(v.tagsText),
    options: v.options.map((o) => ({
      ...o,
      values: o.values.map((val) => ({ ...val, minCopies: val.minCopies ?? undefined })),
    })),
  } as unknown as ProductInput;
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function ProductFormPage() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const { data: categories } = useAdminCategories();
  const { data: product, isLoading, error } = useAdminProduct(isNew ? undefined : id);
  const save = useSaveProduct();
  const remove = useDeleteProduct();
  useBreadcrumbLabel(isNew ? null : en(product?.name));

  const form = useForm<ProductFormValues>({ defaultValues: toForm() });
  const { register, control, handleSubmit, reset, setValue, getValues } = form;

  useEffect(() => {
    if (product) reset(toForm(product));
  }, [product, reset]);

  if (!isNew && isLoading) return <PageLoader />;
  if (!isNew && error) return <ErrorState error={error} />;

  const onSubmit = handleSubmit(async (values) => {
    const ok = await confirmAction({
      title: isNew ? `Create “${values.name.en}”?` : `Save changes to “${values.name.en}”?`,
      description: values.isActive ? 'New prices and details apply to the website straight away. Orders already placed keep their prices.' : 'The product stays hidden from the website until you switch it on.',
      confirmLabel: isNew ? 'Create product' : 'Save changes',
      action: () => save.mutateAsync({ id: isNew ? undefined : id, data: toInput(values) }),
      successTitle: isNew ? 'Product created' : 'Product updated',
    });
    if (ok) navigate('/products');
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6 pb-20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-brand-navy sm:text-[1.75rem] dark:text-foreground">{isNew ? 'New product' : en(product?.name)}</h1>
        <div className="flex gap-2">
          {!isNew && (
            <Button
              type="button"
              variant="danger"
              
              disabled={remove.isPending}
              onClick={async () => {
                const ok = await confirmAction({
                  tone: 'danger',
                  title: `Delete “${en(product?.name)}”?`,
                  description: 'This cannot be undone. Products that already have orders can only be hidden, not deleted.',
                  confirmLabel: 'Delete product',
                  action: () => remove.mutateAsync(id!),
                  successTitle: 'Product deleted',
                });
                if (ok) navigate('/products');
              }}
            >
              <IconTrash /> Delete
            </Button>
          )}
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Spinner className="size-4 text-current" /> : <IconDeviceFloppy />} Save product
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-6 *:min-w-0 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basics</CardTitle>
              <CardDescription>Write both English and Hindi — customers switch language on the website.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Name (English)">
                <Input
                  {...register('name.en', {
                    required: true,
                    onBlur: (e) => {
                      if (!getValues('slug')) setValue('slug', slugify(e.target.value));
                    },
                  })}
                />
              </Field>
              <Field label="नाम (Hindi)">
                <Input {...register('name.hi')} />
              </Field>
              <Field label="URL slug" hint="Lowercase letters, numbers and dashes">
                <Input {...register('slug', { required: true })} />
              </Field>
              <Field label="Category">
                <Controller
                  control={control}
                  name="category"
                  rules={{ required: true }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories?.map((c) => (
                          <SelectItem key={c._id} value={c._id}>
                            {en(c.name)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Short description (English)">
                <Textarea className="min-h-16" {...register('shortDescription.en')} />
              </Field>
              <Field label="छोटा विवरण (Hindi)">
                <Textarea className="min-h-16" {...register('shortDescription.hi')} />
              </Field>
              <Field label="Long description (English)">
                <Textarea {...register('description.en')} />
              </Field>
              <Field label="विस्तृत विवरण (Hindi)">
                <Textarea {...register('description.hi')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Images</CardTitle>
              <CardDescription>Photos of the finished product or samples. Shown on the website card and product page.</CardDescription>
            </CardHeader>
            <CardContent>
              <Controller
                control={control}
                name="images"
                render={({ field }) => <ImageListEditor value={field.value} onChange={field.onChange} max={5} />}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Demo video</CardTitle>
              <CardDescription>Optional. Shown first on the product page with a play button: a YouTube link or an uploaded MP4 (up to 100 MB).</CardDescription>
            </CardHeader>
            <CardContent>
              <Controller control={control} name="videoUrl" render={({ field }) => <VideoEditor value={field.value} onChange={field.onChange} />} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
              <CardDescription>
                Price per unit drops as quantity crosses each tier. Institution prices apply only to approved institution accounts.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <PriceBookEditor audience="retail" control={control} register={register} title="Individuals" description="Students, families, walk-in customers" />
              <PriceBookEditor audience="institution" control={control} register={register} title="Institutions" description="Schools, colleges, businesses (bulk)" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Options</CardTitle>
              <CardDescription>Size, paper, binding… each choice can change the price.</CardDescription>
            </CardHeader>
            <CardContent>
              <OptionsEditor control={control} register={register} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>How it's sold</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Unit" hint="Page-based products price by pages × copies">
                <Controller
                  control={control}
                  name="unit"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {['page', 'piece', 'card', 'copy', 'set', 'photo'].map((u) => (
                          <SelectItem key={u} value={u} className="capitalize">
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Workflow">
                <Controller
                  control={control}
                  name="workflow"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="standard">Standard — instant price</SelectItem>
                        <SelectItem value="design">Design — proof approval</SelectItem>
                        <SelectItem value="identity">Identity — sensitive PVC card</SelectItem>
                        <SelectItem value="quote">Quote — staff sets price</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field label="Icon">
                <Controller
                  control={control}
                  name="icon"
                  render={({ field }) => (
                    <IconPicker value={field.value} onChange={field.onChange} />
                  )}
                />
              </Field>
              <Field label="Contact number" hint="Call / WhatsApp for this product. Empty = shop number">
                <Input type="tel" inputMode="numeric" maxLength={10} placeholder="98765 43210" {...register('contactPhone')} />
              </Field>
              <Field label="Ready in (working days)" hint="0 = same day. Sets each order's ready-by date">
                <Input type="number" min={0} {...register('leadTimeDays', { valueAsNumber: true })} />
              </Field>
              <Field label="Specs" hint="Comma separated, e.g. 8.6 × 5.4 cm, 300 GSM">
                <Input {...register('specsText')} />
              </Field>
              <Field label="Search tags" hint="Comma separated">
                <Input {...register('tagsText')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Uploads</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Controller
                control={control}
                name="requiresUpload"
                render={({ field }) => (
                  <label className="flex items-center justify-between text-sm">
                    Customer must upload a file
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </label>
                )}
              />
              <Controller
                control={control}
                name="sensitive"
                render={({ field }) => (
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      Identity documents
                      <span className="block text-xs text-muted-foreground">Private, staff-only, auto-deleted after delivery</span>
                    </span>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </label>
                )}
              />
              <Field label="Accepted file types">
                <Controller
                  control={control}
                  name="acceptedFileTypes"
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-1.5">
                      {FILE_TYPES.map((t) => {
                        const on = field.value.includes(t);
                        return (
                          <button
                            type="button"
                            key={t}
                            onClick={() => field.onChange(on ? field.value.filter((x) => x !== t) : [...field.value, t])}
                            className={cn(
                              'rounded-md shadow-card px-2 py-1 text-xs font-semibold uppercase',
                              on ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground',
                            )}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  )}
                />
              </Field>
              <Field label="Upload hint (English)">
                <Input {...register('uploadHint.en')} />
              </Field>
              <Field label="अपलोड संकेत (Hindi)">
                <Input {...register('uploadHint.hi')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Visibility</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <label className="flex items-center justify-between text-sm">
                    Visible on website
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </label>
                )}
              />
              <Controller
                control={control}
                name="isFeatured"
                render={({ field }) => (
                  <label className="flex items-center justify-between text-sm">
                    Featured on home page
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </label>
                )}
              />
              <Field label="Sort order" hint="Lower numbers show first">
                <Input type="number" {...register('sortOrder', { valueAsNumber: true })} />
              </Field>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
