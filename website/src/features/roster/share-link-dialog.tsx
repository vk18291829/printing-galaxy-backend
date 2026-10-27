import { IconBrandWhatsapp, IconCopy, IconLink, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, getErrorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import type { PersonKind } from './api';

interface PhotoLink {
  _id: string;
  label: string;
  expiresAt: string;
  photosTaken: number;
  token?: string;
}

const linkUrl = (token: string) => `${window.location.origin}/p/${token}`;

/**
 * Share a photo link with a class teacher: they open it on their phone and photograph the class,
 * no account needed. Links last a week and can be switched off here.
 */
export function ShareLinkDialog({ kind, cls, section, onClose }: { kind: PersonKind; cls?: string; section?: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<PhotoLink | null>(null);
  const links = useQuery({ queryKey: ['roster-links'], queryFn: async () => (await api.get<PhotoLink[]>('/institution/roster/links')).data });
  const create = useMutation({
    mutationFn: async () => (await api.post<PhotoLink>('/institution/roster/links', { kind, class: cls, section })).data,
    onSuccess: (link) => {
      setCreated(link);
      void queryClient.invalidateQueries({ queryKey: ['roster-links'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/institution/roster/links/${id}`),
    onSuccess: () => {
      toast.success(t('photoLink.revoked'));
      void queryClient.invalidateQueries({ queryKey: ['roster-links'] });
    },
  });

  const scope = kind === 'staff' ? t('roster.scopeStaff') : cls ? t('roster.scopeClass', { cls: `${cls}${section ? `-${section}` : ''}` }) : t('roster.scopeAll');
  const url = created?.token ? linkUrl(created.token) : null;
  const message = url ? t('photoLink.shareMessage', { scope, url }) : '';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">{t('photoLink.shareTitle')}</DialogTitle>
          <DialogDescription>{t('photoLink.shareDesc', { scope })}</DialogDescription>
        </DialogHeader>

        {url ? (
          <div className="space-y-3">
            <div className="rounded-xl shadow-card bg-muted/50 p-3 font-mono text-xs break-all">{url}</div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success(t('photoLink.copied')))}
              >
                <IconCopy /> {t('photoLink.copy')}
              </Button>
              <Button className="bg-[#25D366] text-white hover:bg-[#1ebe5b]" asChild>
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer">
                  <IconBrandWhatsapp /> WhatsApp
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('photoLink.onlyOnce')}</p>
          </div>
        ) : (
          <Button variant="brand" size="lg" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? <Spinner className="size-4 text-current" /> : <IconLink />} {t('photoLink.create', { scope })}
          </Button>
        )}

        {(links.data?.length ?? 0) > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-brand-navy">{t('photoLink.active')}</p>
            <ul className="divide-y rounded-xl shadow-card text-sm">
              {links.data!.map((l) => (
                <li key={l._id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{l.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {t('photoLink.linkInfo', { count: l.photosTaken, date: formatDate(l.expiresAt, i18n.language) })}
                    </span>
                  </span>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => revoke.mutate(l._id)} disabled={revoke.isPending}>
                    <IconTrash /> {t('photoLink.revoke')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
