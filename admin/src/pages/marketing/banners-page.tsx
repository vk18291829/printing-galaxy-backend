import { IconArrowRight, IconDiscount2, IconPencil, IconPhoto, IconPlus, IconSparkles, IconSpeakerphone, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { LinkPicker } from '@/components/common/link-picker';
import { EmptyState, ErrorState, PageHeader, PageLoader, Spinner } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCan } from '@/features/auth/auth-store';
import { ImageListEditor } from '@/features/catalog/components/image-list-editor';
import {
  BANNER_THEMES,
  useAdminBanners,
  useDeleteBanner,
  useSaveBanner,
  useToggleBanner,
  type AdminBanner,
  type BannerInput,
  type BannerKind,
  type BannerTheme,
} from '@/features/marketing/api';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const KINDS: { kind: BannerKind; label: string; help: string; icon: typeof IconPhoto }[] = [
  { kind: 'hero', label: 'Hero slides', help: 'Large slides at the top of the home page. Up to 5 work best.', icon: IconPhoto },
  { kind: 'promo', label: 'Promo tiles', help: 'Up to 3 tiles under the categories, e.g. one per campaign or category.', icon: IconSpeakerphone },
  { kind: 'feature', label: 'New feature', help: 'A wide announcement between product rows. The first active one is shown.', icon: IconSparkles },
  { kind: 'offer', label: 'Offer strip', help: 'Short messages rotating in the black strip above the site header.', icon: IconDiscount2 },
];

/** Same gradients the website uses, so the preview matches. */
const THEME_BG: Record<BannerTheme, string> = {
  blue: 'linear-gradient(135deg, #0b3fa8, #1d6cf0)',
  magenta: 'linear-gradient(135deg, #8a0b57, #d9138a)',
  sunset: 'linear-gradient(135deg, #c2410c, #f97316)',
  mint: 'linear-gradient(135deg, #065f46, #0f9f77)',
  dark: 'linear-gradient(135deg, #09090b, #27272a)',
};

const empty = (kind: BannerKind): BannerInput => ({
  kind,
  title: { en: '', hi: '' },
  subtitle: { en: '', hi: '' },
  ctaLabel: { en: '', hi: '' },
  link: '',
  imageUrl: '',
  theme: kind === 'hero' ? 'dark' : 'blue',
  badge: kind === 'feature' ? 'NEW' : '',
  couponCode: '',
  startsAt: null,
  endsAt: null,
  isActive: true,
  sortOrder: 0,
});

/** ISO → yyyy-mm-dd in local time, for <input type="date">. */
const toDateInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function scheduleLabel(b: AdminBanner) {
  const now = Date.now();
  if (b.endsAt && new Date(b.endsAt).getTime() < now) return { text: 'Ended · hidden on website', variant: 'warning' as const };
  if (b.startsAt && new Date(b.startsAt).getTime() > now) return { text: `Starts ${formatDate(b.startsAt)}`, variant: 'info' as const };
  if (b.endsAt) return { text: `Until ${formatDate(b.endsAt)}`, variant: 'outline' as const };
  return null;
}

function Preview({ form }: { form: BannerInput }) {
  if (form.kind === 'offer') {
    return (
      <div className="flex h-9 items-center justify-center gap-2 rounded-lg bg-zinc-950 px-3 text-xs text-white">
        <IconDiscount2 className="size-4 text-amber-400" />
        <span className="truncate font-medium">{form.title.en || 'Offer message'}</span>
        {form.couponCode && <span className="rounded border border-dashed border-white/40 px-1.5 py-0.5 font-mono text-[11px]">{form.couponCode}</span>}
      </div>
    );
  }
  return (
    <div
      className={cn('relative overflow-hidden rounded-xl text-white', form.kind === 'hero' ? 'min-h-40' : 'min-h-28')}
      style={{ background: THEME_BG[form.theme] }}
    >
      {form.imageUrl && (
        <>
          <img src={form.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-linear-to-r from-black/75 via-black/40 to-black/5" />
        </>
      )}
      <div className="relative flex h-full flex-col justify-center gap-1.5 p-5">
        {form.badge && <span className="w-fit rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">{form.badge}</span>}
        <p className={cn('font-bold', form.kind === 'hero' ? 'text-xl' : 'text-base')}>{form.title.en || 'Banner title'}</p>
        {form.subtitle.en && <p className="text-xs text-white/85">{form.subtitle.en}</p>}
        {form.link && (
          <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-zinc-900">
            {form.ctaLabel.en || 'Shop now'} <IconArrowRight className="size-3" />
          </span>
        )}
      </div>
    </div>
  );
}

function BannerDialog({ banner, kind, onClose }: { banner: AdminBanner | null; kind: BannerKind; onClose: () => void }) {
  const save = useSaveBanner();
  const [form, setForm] = useState<BannerInput>(() =>
    banner
      ? {
          kind: banner.kind,
          title: { en: banner.title.en, hi: banner.title.hi ?? '' },
          subtitle: { en: banner.subtitle?.en ?? '', hi: banner.subtitle?.hi ?? '' },
          ctaLabel: { en: banner.ctaLabel?.en ?? '', hi: banner.ctaLabel?.hi ?? '' },
          link: banner.link ?? '',
          imageUrl: banner.imageUrl ?? '',
          theme: banner.theme,
          badge: banner.badge ?? '',
          couponCode: banner.couponCode ?? '',
          startsAt: banner.startsAt,
          endsAt: banner.endsAt,
          isActive: banner.isActive,
          sortOrder: banner.sortOrder,
        }
      : empty(kind),
  );
  const set = <K extends keyof BannerInput>(k: K, v: BannerInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isOffer = form.kind === 'offer';
  const meta = KINDS.find((k) => k.kind === form.kind)!;

  const submit = async () => {
    if (!form.title.en.trim()) return toast.error('Add an English title');
    const ok = await confirmAction({
      title: banner ? 'Save changes to this banner?' : 'Publish this banner?',
      description: form.isActive ? 'Visitors will see it on the website within a minute.' : 'It is saved as inactive and stays hidden until you switch it on.',
      confirmLabel: banner ? 'Save changes' : 'Save banner',
      action: () => save.mutateAsync({ id: banner?._id, data: form }),
      successTitle: banner ? 'Banner updated' : 'Banner saved',
    });
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {banner ? 'Edit' : 'New'} {meta.label.toLowerCase().replace(/s$/, '')}
          </DialogTitle>
          <DialogDescription>{meta.help}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Preview</Label>
          <Preview form={form} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="b-title-en">{isOffer ? 'Message' : 'Title'} (English)</Label>
            <Input id="b-title-en" value={form.title.en} maxLength={120} onChange={(e) => set('title', { ...form.title, en: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-title-hi">{isOffer ? 'संदेश' : 'शीर्षक'} (Hindi)</Label>
            <Input id="b-title-hi" value={form.title.hi} maxLength={120} onChange={(e) => set('title', { ...form.title, hi: e.target.value })} />
          </div>

          {!isOffer && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="b-sub-en">Subtitle (English)</Label>
                <Input id="b-sub-en" value={form.subtitle.en} maxLength={200} onChange={(e) => set('subtitle', { ...form.subtitle, en: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-sub-hi">उपशीर्षक (Hindi)</Label>
                <Input id="b-sub-hi" value={form.subtitle.hi} maxLength={200} onChange={(e) => set('subtitle', { ...form.subtitle, hi: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-cta-en">Button label (English)</Label>
                <Input id="b-cta-en" placeholder="Shop now" value={form.ctaLabel.en} maxLength={40} onChange={(e) => set('ctaLabel', { ...form.ctaLabel, en: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="b-cta-hi">बटन (Hindi)</Label>
                <Input id="b-cta-hi" placeholder="अभी ख़रीदें" value={form.ctaLabel.hi} maxLength={40} onChange={(e) => set('ctaLabel', { ...form.ctaLabel, hi: e.target.value })} />
              </div>
            </>
          )}

          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="b-link">Link</Label>
              <LinkPicker value={form.link} onPick={(link) => set('link', link)} />
            </div>
            <Input id="b-link" placeholder="/products?category=gifts  or  https://…" value={form.link} onChange={(e) => set('link', e.target.value.trim())} />
            <p className="text-xs text-muted-foreground">Site paths start with “/”. Leave empty for a banner that isn't clickable.</p>
          </div>

          {!isOffer && (
            <>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Colour</Label>
                <div className="flex flex-wrap gap-2">
                  {BANNER_THEMES.map((th) => (
                    <button
                      key={th}
                      type="button"
                      onClick={() => set('theme', th)}
                      aria-label={th}
                      aria-pressed={form.theme === th}
                      className={cn('h-9 w-14 rounded-lg ring-offset-2 ring-offset-background', form.theme === th && 'ring-2 ring-primary')}
                      style={{ background: THEME_BG[th] }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Background image (optional)</Label>
                <ImageListEditor value={form.imageUrl ? [form.imageUrl] : []} onChange={(urls) => set('imageUrl', urls[0] ?? '')} max={1} />
                <p className="text-xs text-muted-foreground">Wide images work best (about 1600 × 600). Text sits on the left, so keep that side calm.</p>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="b-badge">Badge</Label>
            <Input id="b-badge" placeholder="NEW, 20% OFF…" maxLength={24} value={form.badge} onChange={(e) => set('badge', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-coupon">Coupon code</Label>
            <Input
              id="b-coupon"
              className="font-mono uppercase"
              maxLength={24}
              value={form.couponCode}
              onChange={(e) => set('couponCode', e.target.value.toUpperCase().replace(/\s/g, ''))}
            />
            <p className="text-xs text-muted-foreground">Shown with a copy button in the offer strip. Apply the discount at the counter.</p>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="b-start">Show from</Label>
              {form.startsAt && (
                <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => set('startsAt', null)}>
                  Clear
                </button>
              )}
            </div>
            <Input
              id="b-start"
              type="date"
              value={toDateInput(form.startsAt)}
              onChange={(e) => set('startsAt', e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null)}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="b-end">Show until</Label>
              {form.endsAt && (
                <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => set('endsAt', null)}>
                  No end date
                </button>
              )}
            </div>
            <Input
              id="b-end"
              type="date"
              value={toDateInput(form.endsAt)}
              onChange={(e) => set('endsAt', e.target.value ? new Date(`${e.target.value}T23:59:59`).toISOString() : null)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-sort">Order</Label>
            <Input id="b-sort" type="number" value={form.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} />
          </div>
          <label className="flex items-center justify-between gap-3 self-end rounded-lg shadow-card px-3 py-2.5 text-sm font-medium">
            Active
            <Switch checked={form.isActive} onCheckedChange={(v) => set('isActive', v)} />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending && <Spinner className="size-4 text-current" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BannersPage() {
  const isAdmin = useCan('marketing');
  const { data, isLoading, error, refetch } = useAdminBanners();
  const toggle = useToggleBanner();
  const remove = useDeleteBanner();
  const [kind, setKind] = useState<BannerKind>('hero');
  const [editing, setEditing] = useState<AdminBanner | 'new' | null>(null);

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const meta = KINDS.find((k) => k.kind === kind)!;
  const rows = (data ?? []).filter((b) => b.kind === kind);

  return (
    <div>
      <PageHeader
        title="Banners & offers"
        description="Home page slides, promotion tiles, new-feature announcements and the offer strip."
        actions={
          isAdmin && (
            <Button onClick={() => setEditing('new')}>
              <IconPlus /> New {meta.label.toLowerCase().replace(/s$/, '')}
            </Button>
          )
        }
      />

      <Tabs value={kind} onValueChange={(v) => setKind(v as BannerKind)} className="mb-4">
        <TabsList className="h-auto flex-wrap">
          {KINDS.map((k) => {
            const live = (data ?? []).filter((b) => b.kind === k.kind && b.isActive).length;
            return (
              <TabsTrigger key={k.kind} value={k.kind}>
                <k.icon /> {k.label}
                <span className="ml-1 text-xs text-muted-foreground tabular-nums">{live}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <p className="mb-4 text-sm text-muted-foreground">{meta.help}</p>

      {rows.length === 0 ? (
        <Card className="gap-0 py-0">
          <EmptyState icon={<meta.icon />} title={`No ${meta.label.toLowerCase()} yet`} description="Nothing is shown in this spot on the website until you add one." />
        </Card>
      ) : (
        <div className="grid gap-3">
          {rows.map((b) => {
            const sched = scheduleLabel(b);
            return (
              <Card key={b._id} className="flex-row items-center gap-4 p-3 sm:p-4">
                <div className="w-28 shrink-0 sm:w-44">
                  {b.kind === 'offer' ? (
                    <div className="grid h-9 place-items-center rounded-md bg-zinc-950 text-amber-400">
                      <IconDiscount2 className="size-4" />
                    </div>
                  ) : (
                    <div className="relative aspect-[2.4/1] overflow-hidden rounded-md" style={{ background: THEME_BG[b.theme] }}>
                      {b.imageUrl && <img src={b.imageUrl} alt="" className="absolute inset-0 size-full object-cover" />}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{b.title.en}</p>
                    {b.badge && <Badge variant="soft">{b.badge}</Badge>}
                    {b.couponCode && (
                      <Badge variant="outline" className="font-mono">
                        {b.couponCode}
                      </Badge>
                    )}
                    {sched && <Badge variant={sched.variant}>{sched.text}</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.link || 'No link'} · order {b.sortOrder}
                  </p>
                </div>
                <Switch
                  checked={b.isActive}
                  disabled={!isAdmin || toggle.isPending}
                  aria-label="Active"
                  onCheckedChange={(v) =>
                    void confirmAction({
                      tone: v ? 'default' : 'danger',
                      title: v ? `Show “${b.title.en}”?` : `Hide “${b.title.en}”?`,
                      description: v ? 'It appears on the website within a minute (if inside its dates).' : 'It is removed from the website but kept here so you can show it again.',
                      confirmLabel: v ? 'Show banner' : 'Hide banner',
                      action: () => toggle.mutateAsync({ id: b._id, isActive: v }),
                      successTitle: v ? 'Banner shown' : 'Banner hidden',
                    })
                  }
                />
                {isAdmin && (
                  <div className="flex shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setEditing(b)}>
                      <IconPencil /> <span className="hidden sm:inline">Edit</span>
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      
                      aria-label="Delete"
                      onClick={() =>
                        void confirmAction({
                          tone: 'danger',
                          title: `Delete “${b.title.en}”?`,
                          description: 'This cannot be undone. To take it down for now, switch it off instead.',
                          confirmLabel: 'Delete banner',
                          action: () => remove.mutateAsync(b._id),
                          successTitle: 'Banner deleted',
                        })
                      }
                    >
                      <IconTrash />
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {editing && <BannerDialog banner={editing === 'new' ? null : editing} kind={kind} onClose={() => setEditing(null)} />}
    </div>
  );
}
