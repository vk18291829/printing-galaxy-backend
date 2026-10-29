import { IconBell, IconBuilding, IconChevronRight, IconLanguage, IconMail, IconMapPin, IconPackage, IconPhone, IconUser } from '@tabler/icons-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { confirmAction } from '@/components/common/confirm-dialog';
import { PrefixedInput } from '@/components/common/prefixed-input';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AvatarPicker, UserAvatar } from '@/features/account/avatar';
import { useUpdateAccount } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { usePublicSettings } from '@/features/settings/api';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { chooseLanguage } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { Address, Institution, User } from '@/types/api';

const EMPTY: Address = { line1: '', line2: '', city: '', state: '', pincode: '' };

/** One part of the form: an icon heading, a line on what it is for, then the fields. */
function Section({ icon, title, description, children, className }: { icon: ReactNode; title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border bg-card p-5 sm:p-6', className)}>
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary [&_svg]:size-5">{icon}</span>
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">{title}</h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** The navy band at the top: photo, name, how to reach them, and shortcuts. */
function ProfileHeader({ picture, name, lines }: { picture: ReactNode; name: string; lines: { icon: ReactNode; text: string }[] }) {
  const { t } = useTranslation();
  return (
    <div className="relative overflow-hidden rounded-3xl bg-brand-navy p-6 text-white sm:p-8">
      <span aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-brand-cyan/25 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 size-64 rounded-full bg-brand-amber/20 blur-3xl" />
      <div className="relative flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:text-left">
        {picture}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight break-words sm:text-3xl">{name}</h1>
          <ul className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm text-white/75 sm:justify-start">
            {lines.map((l) => (
              <li key={l.text} className="flex min-w-0 items-center gap-1.5 [&_svg]:size-4 [&_svg]:shrink-0">
                {l.icon} <span className="truncate">{l.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-2">
          <Link to="/account/orders" className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/20">
            <IconPackage className="size-4" /> {t('nav.myOrders')}
          </Link>
          <Link to="/account/updates" className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/20">
            <IconBell className="size-4" /> {t('nav.updates')}
          </Link>
        </div>
      </div>
    </div>
  );
}

function AddressFields({ value, onChange, id }: { value: Address; onChange: (a: Address) => void; id: string }) {
  const { t } = useTranslation();
  const set = (key: keyof Address) => (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${id}-line1`}>{t('auth.line1')}</Label>
        <Input id={`${id}-line1`} value={value.line1} onChange={set('line1')} autoComplete="address-line1" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor={`${id}-line2`}>{t('auth.line2')}</Label>
        <Input id={`${id}-line2`} value={value.line2 ?? ''} onChange={set('line2')} autoComplete="address-line2" />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-city`}>{t('auth.city')}</Label>
        <Input id={`${id}-city`} value={value.city} onChange={set('city')} autoComplete="address-level2" />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-state`}>{t('auth.state')}</Label>
        <Input id={`${id}-state`} value={value.state} onChange={set('state')} autoComplete="address-level1" />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-pin`}>{t('auth.pincode')}</Label>
        <Input id={`${id}-pin`} value={value.pincode} onChange={set('pincode')} inputMode="numeric" maxLength={6} autoComplete="postal-code" />
      </div>
    </div>
  );
}

/** Shown once something changed, and kept in reach (above the phone tab bar) until saved. */
function SaveBar({ pending, dirty }: { pending: boolean; dirty: boolean }) {
  const { t } = useTranslation();
  if (!dirty) return null;
  return (
    <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-10 flex items-center justify-between gap-3 rounded-2xl border border-brand-amber/60 bg-card/95 p-3 pl-5 backdrop-blur lg:bottom-4 lg:col-span-full">
      <p className="flex items-center gap-2 text-sm font-medium">
        <span className="size-2 shrink-0 rounded-full bg-brand-amber" /> {t('account.unsaved')}
      </p>
      <Button type="submit" variant="brand" disabled={pending}>
        {pending && <Spinner className="size-4 text-current" />} {t('common.save')}
      </Button>
    </div>
  );
}

function UserProfile({ user }: { user: User }) {
  const { t, i18n } = useTranslation();
  const update = useUpdateAccount();
  // Customers sign in with their email (email channel) or mobile number (SMS); that one is locked.
  const byEmail = usePublicSettings().data?.messaging !== 'sms';
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [language, setLanguage] = useState(user.language);
  const [offers, setOffers] = useState(user.offers !== false);
  const [address, setAddress] = useState<Address>(user.addresses[0] ?? EMPTY);

  const saved = user.addresses[0] ?? EMPTY;
  const dirty =
    name !== user.name ||
    email !== (user.email ?? '') ||
    phone !== (user.phone ?? '') ||
    language !== user.language ||
    offers !== (user.offers !== false) ||
    (Object.keys(EMPTY) as (keyof Address)[]).some((k) => (address[k] ?? '') !== (saved[k] ?? ''));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const hasAddress = address.line1.trim() && address.city.trim() && /^\d{6}$/.test(address.pincode);
    void confirmAction({
      title: t('confirm.profileTitle'),
      description: t('confirm.profileDesc'),
      confirmLabel: t('confirm.saveChanges'),
      action: () =>
        update.mutateAsync({
          name: name.trim(),
          ...(byEmail ? { phone: phone.replace(/\D/g, '').slice(-10) } : { email: email.trim() }),
          language,
          offers,
          addresses: hasAddress ? [address] : [],
        }),
      successTitle: t('account.saved'),
    }).then((ok) => {
      if (ok && language !== i18n.language) void chooseLanguage(language);
    });
  };

  const contact = [
    user.email && { icon: <IconMail />, text: user.email },
    user.phone && { icon: <IconPhone />, text: `+91 ${user.phone}` },
  ].filter(Boolean) as { icon: ReactNode; text: string }[];

  return (
    <div className="space-y-6">
      <ProfileHeader picture={<AvatarPicker name={user.name} src={user.avatarUrl} />} name={user.name} lines={contact} />

      <form onSubmit={submit} className="grid items-start gap-6 *:min-w-0 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Section icon={<IconUser />} title={t('account.details')} description={t('account.detailsDesc')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">{t('account.name')}</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t('account.phone')}</Label>
                {byEmail ? (
                  <PrefixedInput id="phone" prefix="+91" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12))} />
                ) : (
                  <Input id="phone" value={`+91 ${user.phone ?? ''}`} disabled />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t('account.email')}</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={byEmail} />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">{byEmail ? t('account.emailLocked') : t('account.phoneLocked')}</p>
            </div>
          </Section>

          <Section icon={<IconMapPin />} title={t('account.addresses')} description={t('account.addressDesc')}>
            <AddressFields id="addr" value={address} onChange={setAddress} />
          </Section>
        </div>

        <Section icon={<IconLanguage />} title={t('account.preferences')} className="lg:sticky lg:top-28">
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('account.language')}</p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('account.language')}>
                {(
                  [
                    ['en', 'English'],
                    ['hi', 'हिंदी'],
                  ] as const
                ).map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={language === code}
                    onClick={() => setLanguage(code)}
                    className={cn(
                      'h-11 rounded-xl border text-sm font-semibold transition-colors',
                      language === code ? 'border-primary bg-primary/6 text-primary ring-2 ring-primary/15' : 'hover:border-primary/40',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
              <span className="min-w-0">
                <span className="block text-sm font-medium">{t('account.offers')}</span>
                <span className="block text-xs text-muted-foreground">{t('account.offersDesc')}</span>
              </span>
              <Switch checked={offers} onCheckedChange={setOffers} />
            </label>
            <Link to="/privacy" className="flex items-center justify-between gap-3 rounded-xl bg-secondary/60 p-4 text-sm font-medium text-foreground hover:bg-secondary">
              {t('account.privacyLink')} <IconChevronRight className="size-4 text-muted-foreground" />
            </Link>
          </div>
        </Section>

        <SaveBar pending={update.isPending} dirty={dirty} />
      </form>
    </div>
  );
}

function InstitutionProfile({ institution }: { institution: Institution }) {
  const { t } = useTranslation();
  const update = useUpdateAccount();
  const [contactName, setContactName] = useState(institution.contactName);
  const [designation, setDesignation] = useState(institution.designation ?? '');
  const [phone, setPhone] = useState(institution.phone);
  const [address, setAddress] = useState<Address>(institution.address);

  const dirty =
    contactName !== institution.contactName ||
    designation !== (institution.designation ?? '') ||
    phone !== institution.phone ||
    (Object.keys(EMPTY) as (keyof Address)[]).some((k) => (address[k] ?? '') !== (institution.address[k] ?? ''));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void confirmAction({
      title: t('confirm.profileTitle'),
      description: t('confirm.profileDesc'),
      confirmLabel: t('confirm.saveChanges'),
      action: () => update.mutateAsync({ contactName, designation, phone, address }),
      successTitle: t('account.saved'),
    });
  };

  return (
    <div className="space-y-6">
      <ProfileHeader
        picture={<UserAvatar name={institution.name} src={institution.logoUrl} className="size-24 bg-white text-3xl text-brand-navy ring-4 ring-white/15 sm:size-28 [&_img]:object-contain [&_img]:p-2" />}
        name={institution.name}
        lines={[
          { icon: <IconBuilding />, text: t(`auth.types.${institution.type}`) },
          { icon: <IconMail />, text: institution.email },
        ]}
      />
      <form onSubmit={submit} className="grid items-start gap-6 *:min-w-0 lg:grid-cols-2">
        <Section icon={<IconUser />} title={t('account.contact')} description={t('account.detailsDesc')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="contact">{t('auth.contactName')}</Label>
              <Input id="contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="designation">{t('auth.designation')}</Label>
              <Input id="designation" value={designation} onChange={(e) => setDesignation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="iphone">{t('auth.phone')}</Label>
              <Input id="iphone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" maxLength={10} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gstin">{t('auth.gstin')}</Label>
              <Input id="gstin" value={institution.gstin ?? '—'} disabled />
            </div>
          </div>
        </Section>
        <Section icon={<IconMapPin />} title={t('auth.sectionAddress')}>
          <AddressFields id="iaddr" value={address} onChange={setAddress} />
        </Section>
        <SaveBar pending={update.isPending} dirty={dirty} />
      </form>
    </div>
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('account.profile'));
  const principal = useAuthStore((s) => s.principal);
  if (!principal) return null;
  return (
    <div className="container-page max-w-6xl py-8 sm:py-10">
      {principal.kind === 'user' ? <UserProfile user={principal.user} /> : <InstitutionProfile institution={principal.institution} />}
    </div>
  );
}
