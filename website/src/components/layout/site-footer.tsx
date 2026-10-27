import { IconBrandWhatsapp, IconClock, IconMail, IconMapPin, IconPhone, IconShieldLock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Logo } from '@/components/common/logo';
import { SocialLinks } from '@/components/common/social-links';
import { useCategories } from '@/features/catalog/api';
import { InstallAppButton } from '@/features/pwa/pwa';
import { usePublicSettings } from '@/features/settings/api';
import { useLocalized } from '@/lib/i18n';
import { LEGAL_PAGES } from '@/lib/legal';
import { categoryHome } from '@/features/catalog/sections';

export function SiteFooter() {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data: settings } = usePublicSettings();
  const { data: categories } = useCategories();
  const shop = settings?.shop;

  return (
    <footer className="bg-brand-navy mt-20 text-white lg:mt-24">
      <div className="h-1 cmyk-strip" />
      <div className="container-page grid grid-cols-2 gap-x-6 gap-y-10 py-12 sm:py-14 lg:grid-cols-4">
        <div className="col-span-2 space-y-4 lg:col-span-1">
          <Logo inverted />
          <p className="max-w-xs text-sm text-white/65">{t('footer.about')}</p>
          <p className="flex items-start gap-2 text-xs text-white/60">
            <IconShieldLock className="mt-0.5 size-4 shrink-0 text-brand-cyan" />
            {t('footer.privacy')}
          </p>
          <SocialLinks social={settings?.social} className="[&_a]:border-white/15 [&_a]:bg-white/5 [&_a]:text-white/75 [&_a:hover]:border-primary [&_a:hover]:text-white" />
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-white">{t('footer.shop')}</h3>
          <ul className="space-y-2.5 text-sm text-white/65">
            {categories?.map((c) => (
              <li key={c._id}>
                <Link to={categoryHome(c.slug)} className="hover:text-white">
                  {l(c.name)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-4 text-sm font-bold text-white">{t('footer.company')}</h3>
          <ul className="space-y-2.5 text-sm text-white/65">
            <li><Link to="/institutions" className="hover:text-white">{t('nav.institutions')}</Link></li>
            <li><Link to="/login?tab=institution" className="hover:text-white">{t('nav.institutionLogin')}</Link></li>
            <li><Link to="/institutions/register" className="hover:text-white">{t('nav.institutionRegister')}</Link></li>
            <li><Link to="/account/orders" className="hover:text-white">{t('nav.myOrders')}</Link></li>
            <li><Link to="/track" className="hover:text-white">{t('footer.track')}</Link></li>
            <li><Link to="/contact" className="hover:text-white">{t('nav.contact')}</Link></li>
          </ul>
        </div>

        <div className="col-span-2 lg:col-span-1">
          <h3 className="mb-4 text-sm font-bold text-white">{t('nav.contact')}</h3>
          <ul className="space-y-3 text-sm text-white/65">
            {shop?.phone && (
              <li>
                <a href={`tel:+91${shop.phone}`} className="flex items-center gap-2 hover:text-white">
                  <IconPhone className="size-4" /> +91 {shop.phone}
                </a>
              </li>
            )}
            {(shop?.whatsapp || shop?.phone) && (
              <li>
                <a href={`https://wa.me/91${shop.whatsapp || shop.phone}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white">
                  <IconBrandWhatsapp className="size-4" /> WhatsApp
                </a>
              </li>
            )}
            {shop?.email && (
              <li>
                <a href={`mailto:${shop.email}`} className="flex items-center gap-2 hover:text-white">
                  <IconMail className="size-4" /> {shop.email}
                </a>
              </li>
            )}
            {shop?.address && (
              <li className="flex items-start gap-2">
                <IconMapPin className="mt-0.5 size-4 shrink-0" /> {shop.address}
              </li>
            )}
            {shop?.hours && (
              <li className="flex items-center gap-2">
                <IconClock className="size-4" /> {shop.hours}
              </li>
            )}
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container-page flex flex-col items-center justify-between gap-3 py-5 text-xs text-white/60 lg:flex-row">
          <p>© {new Date().getFullYear()} Printing Galaxy. {t('footer.rights')}</p>
          <nav aria-label={t('footer.legal')} className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            {LEGAL_PAGES.map((p) => (
              <Link key={p.kind} to={p.path} className="hover:text-white hover:underline">
                {t(`legal.${p.kind}.title`)}
              </Link>
            ))}
          </nav>
          <InstallAppButton className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" />
        </div>
      </div>
    </footer>
  );
}
