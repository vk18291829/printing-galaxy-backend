import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { confirmAction } from '@/components/common/confirm-dialog';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpdateAccount } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/auth-store';
import { useDocumentTitle } from '@/hooks/use-document-title';
import type { Address, Institution, User } from '@/types/api';

const EMPTY: Address = { line1: '', line2: '', city: '', state: '', pincode: '' };

function AddressFields({ value, onChange }: { value: Address; onChange: (a: Address) => void }) {
  const { t } = useTranslation();
  const set = (key: keyof Address) => (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label>{t('auth.line1')}</Label>
        <Input value={value.line1} onChange={set('line1')} autoComplete="address-line1" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>{t('auth.line2')}</Label>
        <Input value={value.line2 ?? ''} onChange={set('line2')} autoComplete="address-line2" />
      </div>
      <div className="space-y-2">
        <Label>{t('auth.city')}</Label>
        <Input value={value.city} onChange={set('city')} autoComplete="address-level2" />
      </div>
      <div className="space-y-2">
        <Label>{t('auth.state')}</Label>
        <Input value={value.state} onChange={set('state')} autoComplete="address-level1" />
      </div>
      <div className="space-y-2">
        <Label>{t('auth.pincode')}</Label>
        <Input value={value.pincode} onChange={set('pincode')} inputMode="numeric" maxLength={6} />
      </div>
    </div>
  );
}

function UserProfile({ user }: { user: User }) {
  const { t, i18n } = useTranslation();
  const update = useUpdateAccount();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email ?? '');
  const [language, setLanguage] = useState(user.language);
  const [address, setAddress] = useState<Address>(user.addresses[0] ?? EMPTY);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const hasAddress = address.line1.trim() && address.city.trim() && /^\d{6}$/.test(address.pincode);
    void confirmAction({
      title: t('confirm.profileTitle'),
      description: t('confirm.profileDesc'),
      confirmLabel: t('confirm.saveChanges'),
      action: () => update.mutateAsync({ name: name.trim(), email: email.trim(), language, addresses: hasAddress ? [address] : [] }),
      successTitle: t('account.saved'),
    }).then((ok) => {
      if (ok && language !== i18n.language) void i18n.changeLanguage(language);
    });
  };

  return (
    <form onSubmit={submit} className="grid items-start gap-6 *:min-w-0 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t('account.profile')}</CardTitle>
          <CardDescription>{t('account.profileDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">{t('account.name')}</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
          <div className="space-y-2">
            <Label>{t('account.phone')}</Label>
            <Input value={`+91 ${user.phone ?? ''}`} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('account.email')}</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="space-y-2">
            <Label>{t('account.language')}</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as 'en' | 'hi')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">हिंदी</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('account.addresses')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AddressFields value={address} onChange={setAddress} />
        </CardContent>
      </Card>
      <Button type="submit" className="w-fit lg:col-span-2" disabled={update.isPending}>
        {update.isPending && <Spinner className="size-4 text-current" />} {t('common.save')}
      </Button>
    </form>
  );
}

function InstitutionProfile({ institution }: { institution: Institution }) {
  const { t } = useTranslation();
  const update = useUpdateAccount();
  const [contactName, setContactName] = useState(institution.contactName);
  const [designation, setDesignation] = useState(institution.designation ?? '');
  const [phone, setPhone] = useState(institution.phone);
  const [address, setAddress] = useState<Address>(institution.address);

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
    <form onSubmit={submit} className="grid items-start gap-6 *:min-w-0 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{institution.name}</CardTitle>
          <CardDescription>
            {t(`auth.types.${institution.type}`)} · {institution.email}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t('auth.contactName')}</Label>
            <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('auth.designation')}</Label>
            <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('auth.phone')}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" maxLength={10} />
          </div>
          <div className="space-y-2">
            <Label>{t('auth.gstin')}</Label>
            <Input value={institution.gstin ?? '—'} disabled />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.sectionAddress')}</CardTitle>
        </CardHeader>
        <CardContent>
          <AddressFields value={address} onChange={setAddress} />
        </CardContent>
      </Card>
      <Button type="submit" className="w-fit lg:col-span-2" disabled={update.isPending}>
        {update.isPending && <Spinner className="size-4 text-current" />} {t('common.save')}
      </Button>
    </form>
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('account.profile'));
  const principal = useAuthStore((s) => s.principal);
  if (!principal) return null;
  return (
    <div className="container-page py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">{t('account.profile')}</h1>
      {principal.kind === 'user' ? (
        <UserProfile user={principal.user} />
      ) : (
        <InstitutionProfile institution={principal.institution} />
      )}
    </div>
  );
}
