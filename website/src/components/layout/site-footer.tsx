import {
  IconBrandWhatsapp,
  IconClock,
  IconFileCheck,
  IconLock,
  IconMail,
  IconMapPin,
  IconPhone,
  IconShieldCheck,
  IconUserShield,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Logo } from '@/components/common/logo';
import { SocialLinks } from '@/components/common/social-links';
import { InstallAppButton } from '@/features/pwa/pwa';
import { usePublicSettings } from '@/features/settings/api';

/** A titled list of links. */
function LinkGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <nav aria-label={title}>
      <h3 className="mb-3.5 text-xs font-bold tracking-wider text-brand-amber uppercase">{title}</h3>
      <ul className="space-y-2.5 text-sm text-white/70 [&_a]:transition-colors [&_a:hover]:text-white">{children}</ul>
    </nav>
  );
}

/** Promises the shop actually keeps (see orders, payments and file retention), in plain words. */
function Assurance({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 text-sm text-white/75 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-brand-amber">
      {icon}
      {children}
    </li>
  );
}

export function SiteFooter() {
  const { t } = useTranslation();
  const { data: settings } = usePublicSettings();
  const shop = settings?.shop;
  const year = new Date().getFullYear();
  const whatsapp = shop?.whatsapp || shop?.phone;

  return (
    <footer className="mt-20 bg-brand-navy text-white lg:mt-24">
      <div className="cmyk-strip h-1" />

      <div className="container-page py-12 sm:py-14">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-12">
          <div className="col-span-2 space-y-5 md:col-span-3 lg:col-span-4">
            <Logo inverted />
            <p className="max-w-sm text-sm leading-relaxed text-white/70">{t('footer.about')}</p>
            <SocialLinks
              social={settings?.social}
              className="[&_a]:border-white/15 [&_a]:bg-white/5 [&_a]:text-white/75 [&_a:hover]:border-brand-amber [&_a:hover]:text-white"
            />
            <InstallAppButton className="border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white" />
          </div>

          <div className="lg:col-span-2">
            <LinkGroup title={t('footer.shop')}>
              <li><Link to="/products">{t('footer.allProducts')}</Link></li>
              <li><Link to="/business-printing">{t('nav.businessPrinting')}</Link></li>
              <li><Link to="/wedding-cards">{t('nav.weddingCards')}</Link></li>
              <li><Link to="/institutions">{t('nav.schoolSolutions')}</Link></li>
            </LinkGroup>
          </div>

          <div className="lg:col-span-2">
            <LinkGroup title={t('footer.company')}>
              <li><Link to="/track">{t('footer.track')}</Link></li>
              <li><Link to="/account/orders">{t('nav.myOrders')}</Link></li>
              <li><Link to="/contact">{t('nav.contact')}</Link></li>
              <li><Link to="/shipping-policy">{t('footer.delivery')}</Link></li>
              <li><Link to="/refund-policy">{t('footer.refunds')}</Link></li>
            </LinkGroup>
          </div>

          <div className="lg:col-span-2">
            <LinkGroup title={t('footer.forSchools')}>
              <li><Link to="/institutions">{t('nav.institutions')}</Link></li>
              <li><Link to="/login?tab=institution">{t('nav.institutionLogin')}</Link></li>
              <li><Link to="/institutions/register">{t('nav.institutionRegister')}</Link></li>
            </LinkGroup>
          </div>

          <div className="col-span-2 md:col-span-1 lg:col-span-2">
            <LinkGroup title={t('nav.contact')}>
              {shop?.phone && (
                <li>
                  <a href={`tel:+91${shop.phone}`} className="flex items-center gap-2">
                    <IconPhone className="size-4 shrink-0" /> +91 {shop.phone}
                  </a>
                </li>
              )}
              {whatsapp && (
                <li>
                  <a href={`https://wa.me/91${whatsapp}`} target="_blank" rel="noreferrer" className="flex items-center gap-2">
                    <IconBrandWhatsapp className="size-4 shrink-0" /> WhatsApp
                  </a>
                </li>
              )}
              {shop?.email && (
                <li>
                  <a href={`mailto:${shop.email}`} className="flex min-w-0 items-center gap-2">
                    <IconMail className="size-4 shrink-0" /> <span className="truncate">{shop.email}</span>
                  </a>
                </li>
              )}
              {shop?.address && (
                <li className="flex items-start gap-2">
                  <IconMapPin className="mt-0.5 size-4 shrink-0" /> {shop.address}
                </li>
              )}
              {shop?.hours && (
                <li className="flex items-start gap-2">
                  <IconClock className="mt-0.5 size-4 shrink-0" /> {shop.hours}
                </li>
              )}
            </LinkGroup>
          </div>
        </div>

        <ul className="mt-10 grid gap-3 border-t border-white/10 pt-8 sm:grid-cols-3">
          <Assurance icon={<IconShieldCheck />}>{t('footer.securePay')}</Assurance>
          <Assurance icon={<IconLock />}>{t('footer.privacy')}</Assurance>
          <Assurance icon={<IconFileCheck />}>{t('footer.proofFirst')}</Assurance>
        </ul>
      </div>

      <div className="border-t border-white/10">
        <div className="container-page space-y-3 py-6 text-xs text-white/60">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <p>
              © {year} {shop?.legalName || shop?.name || 'Printing Galaxy'}. {t('footer.rights')}
              {shop?.gstin && <span className="ml-1">· GSTIN {shop.gstin}</span>}
            </p>
            <nav aria-label={t('footer.legal')} className="flex flex-wrap gap-x-4 gap-y-1.5">
              <Link to="/terms" className="hover:text-white">{t('legal.terms.title')}</Link>
              <Link to="/privacy" className="hover:text-white">{t('legal.privacy.title')}</Link>
              <Link to="/refund-policy" className="hover:text-white">{t('legal.refund.title')}</Link>
              <Link to="/shipping-policy" className="hover:text-white">{t('legal.shipping.title')}</Link>
            </nav>
          </div>
          {/* Required of online shops: who a customer can escalate a complaint to. */}
          {shop?.grievanceName && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <IconUserShield className="size-4 text-brand-amber" />
              <span className="font-medium text-white/75">{t('footer.grievance')}:</span>
              <span>{shop.grievanceName}</span>
              {shop.grievanceEmail && (
                <a href={`mailto:${shop.grievanceEmail}`} className="hover:text-white">
                  · {shop.grievanceEmail}
                </a>
              )}
              {shop.grievancePhone && (
                <a href={`tel:${shop.grievancePhone}`} className="hover:text-white">
                  · {shop.grievancePhone}
                </a>
              )}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}
