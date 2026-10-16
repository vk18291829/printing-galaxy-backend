import { IconBrandWhatsapp, IconClock, IconMail, IconMapPin, IconPhone } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLoader } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';

function ContactCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 rounded-xl border bg-card p-6">
      <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary [&_svg]:size-6">{icon}</span>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export default function ContactPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('nav.contact'));
  const { data, isLoading } = usePublicSettings();
  if (isLoading || !data) return <PageLoader />;
  const { shop } = data;

  return (
    <div className="container-page py-12">
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold">{t('contact.title')}</h1>
        <p className="mt-3 text-muted-foreground">{t('contact.subtitle')}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {shop.phone && (
          <ContactCard icon={<IconPhone />} title={t('contact.call')}>
            <a href={`tel:+91${shop.phone}`} className="text-base font-medium text-foreground hover:text-primary">
              +91 {shop.phone}
            </a>
          </ContactCard>
        )}
        {shop.whatsapp && (
          <ContactCard icon={<IconBrandWhatsapp />} title={t('contact.whatsapp')}>
            <Button size="sm" className="mt-1 bg-[#25D366] text-white hover:bg-[#1fb957]" asChild>
              <a href={`https://wa.me/91${shop.whatsapp}`} target="_blank" rel="noreferrer">
                <IconBrandWhatsapp /> +91 {shop.whatsapp}
              </a>
            </Button>
          </ContactCard>
        )}
        {shop.email && (
          <ContactCard icon={<IconMail />} title={t('contact.email')}>
            <a href={`mailto:${shop.email}`} className="hover:text-primary">{shop.email}</a>
          </ContactCard>
        )}
        {shop.hours && (
          <ContactCard icon={<IconClock />} title={t('contact.hours')}>
            {shop.hours}
          </ContactCard>
        )}
        {shop.address && (
          <div className="sm:col-span-2">
            <ContactCard icon={<IconMapPin />} title={t('contact.visit')}>
              <p>{shop.address}</p>
              {shop.mapUrl && (
                <a href={shop.mapUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-primary hover:underline">
                  {t('contact.directions')} →
                </a>
              )}
            </ContactCard>
          </div>
        )}
      </div>
    </div>
  );
}
