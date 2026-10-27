import { IconCamera, IconCircleCheck, IconClockHour4 } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { ErrorState, PageLoader } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { Person } from '@/features/roster/api';
import { PhotoDialog } from '@/features/roster/photo-dialog';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { api, API_URL } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

interface LinkPage {
  institution?: string;
  label: string;
  expiresAt: string;
  items: Person[];
}

/**
 * A class teacher's photo page, opened from a link the school shares. No sign-in: the link only
 * shows this class's names and roll numbers and only adds photos.
 */
export default function PhotoLinkPage() {
  const { token = '' } = useParams();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const key = ['photo-link', token];
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<LinkPage>(`/roster-links/${token}`)).data,
    retry: false,
  });
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  useDocumentTitle(t('photoLink.title'));

  if (isLoading) return <PageLoader />;
  if (error || !data) {
    return (
      <div className="container-page py-16">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  const done = data.items.filter((p) => p.hasPhoto).length;
  const firstMissing = data.items.find((p) => !p.hasPhoto);

  const upload = async (person: Person, blob: Blob) => {
    const res = await fetch(`${API_URL}/roster-links/${token}/people/${person._id}/photo`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: blob,
    });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error?.message ?? t('photoLink.failed'));
    // Mark it done straight away so "Save & next" moves on; the list refreshes with the new photo.
    queryClient.setQueryData<LinkPage>(key, (old) => old && { ...old, items: old.items.map((p) => (p._id === person._id ? { ...p, hasPhoto: true } : p)) });
    void queryClient.invalidateQueries({ queryKey: key });
  };

  return (
    <div className="container-page max-w-2xl py-6 sm:py-10">
      <p className="text-sm font-semibold text-primary">{data.institution}</p>
      <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">{t('photoLink.heading', { label: data.label })}</h1>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <IconClockHour4 className="size-4" /> {t('photoLink.expires', { date: formatDate(data.expiresAt, i18n.language) })}
      </p>

      <div className="my-5 rounded-xl shadow-card bg-card p-4">
        <div className="mb-1.5 flex justify-between text-sm">
          <span className="font-semibold text-brand-navy">{t('roster.photoProgress', { done, total: data.items.length })}</span>
          <span className="text-muted-foreground">{t('roster.missingCount', { count: data.items.length - done })}</span>
        </div>
        <Progress value={data.items.length ? (done / data.items.length) * 100 : 0} />
        {firstMissing && (
          <Button variant="brand" size="lg" className="mt-4 w-full" onClick={() => setPhotoFor(firstMissing._id)}>
            <IconCamera /> {t('photoLink.start')}
          </Button>
        )}
        {!firstMissing && data.items.length > 0 && (
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-success">
            <IconCircleCheck className="size-5" /> {t('photoLink.allDone')}
          </p>
        )}
      </div>

      <ul className="space-y-2">
        {data.items.map((p) => (
          <li key={p._id}>
            <button type="button" onClick={() => setPhotoFor(p._id)} className="flex w-full items-center gap-3 rounded-xl shadow-card bg-card p-2.5 text-left active:bg-accent">
              <span className={cn('grid aspect-[3/4] w-12 shrink-0 place-items-center overflow-hidden rounded-md shadow-card', !p.hasPhoto && 'border-dashed border-primary/50 bg-primary/5 text-primary')}>
                {p.photoUrl ? <img src={p.photoUrl} alt="" className="size-full object-cover" /> : <IconCamera className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-brand-navy">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {[p.rollNo && `${t('roster.roll')} ${p.rollNo}`, p.code].filter(Boolean).join(' · ')}
                </span>
              </span>
              {p.hasPhoto && <IconCircleCheck className="size-5 shrink-0 text-success" />}
            </button>
          </li>
        ))}
      </ul>

      {photoFor && <PhotoDialog people={data.items} personId={photoFor} onPersonChange={setPhotoFor} onClose={() => setPhotoFor(null)} onSave={upload} />}
    </div>
  );
}
