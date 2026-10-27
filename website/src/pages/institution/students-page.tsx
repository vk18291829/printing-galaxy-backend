import {
  IconCamera,
  IconDownload,
  IconFileSpreadsheet,
  IconId,
  IconLink,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { confirmAction } from '@/components/common/confirm-dialog';
import { PageNav } from '@/components/common/page-nav';
import { EmptyState, ErrorState, PageLoader } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { rosterExportUrl, useDeletePerson, useRoster, type Person, type PersonKind } from '@/features/roster/api';
import { ImportDialog } from '@/features/roster/import-dialog';
import { PersonDialog } from '@/features/roster/person-dialog';
import { PhotoDialog } from '@/features/roster/photo-dialog';
import { ShareLinkDialog } from '@/features/roster/share-link-dialog';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { getErrorMessage } from '@/lib/api-client';
import { fetchFile } from '@/lib/download';
import { cn } from '@/lib/utils';

const ALL = '__all';

function Thumb({ person, onClick, className }: { person: Person; onClick: () => void; className?: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t(person.hasPhoto ? 'roster.changePhoto' : 'roster.addPhoto', { name: person.name })}
      className={cn(
        'group relative grid aspect-[3/4] w-10 shrink-0 place-items-center overflow-hidden rounded-md shadow-card',
        person.hasPhoto ? 'bg-muted' : 'border-dashed border-primary/50 bg-primary/5 text-primary',
        className,
      )}
    >
      {person.photoUrl ? <img src={person.photoUrl} alt="" loading="lazy" className="size-full object-cover" /> : <IconCamera className="size-4" />}
      <span className="absolute inset-0 hidden place-items-center bg-black/40 text-white group-hover:grid">
        <IconCamera className="size-4" />
      </span>
    </button>
  );
}

export default function StudentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [kind, setKind] = useState<PersonKind>('student');
  const { data, isLoading, error, refetch } = useRoster(kind);
  const remove = useDeletePerson();
  const [q, setQ] = useState('');
  const [cls, setCls] = useState(ALL);
  const [section, setSection] = useState(ALL);
  const [missingOnly, setMissingOnly] = useState(false);
  const [editing, setEditing] = useState<Person | null | 'new'>(null);
  const [importing, setImporting] = useState(false);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  useDocumentTitle(t('roster.title'));

  const people = data?.items ?? [];
  const classes = useMemo(() => [...new Set(people.map((p) => p.class).filter(Boolean))] as string[], [people]);
  const sections = useMemo(
    () => [...new Set(people.filter((p) => cls === ALL || p.class === cls).map((p) => p.section).filter(Boolean))] as string[],
    [people, cls],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter(
      (p) =>
        (cls === ALL || p.class === cls) &&
        (section === ALL || p.section === section) &&
        (!missingOnly || !p.hasPhoto) &&
        (!needle || [p.name, p.fatherName, p.code, p.rollNo, p.admissionNo, p.employeeId, p.phone].some((v) => v?.toLowerCase().includes(needle))),
    );
  }, [people, q, cls, section, missingOnly]);

  const isStaff = kind === 'staff';
  const total = data?.total ?? 0;
  const done = data?.withPhoto ?? 0;
  const firstMissing = shown.find((p) => !p.hasPhoto) ?? people.find((p) => !p.hasPhoto);

  // ID cards for exactly what is on screen (a class, a section, or everyone).
  const orderCards = () => {
    const scope = isStaff
      ? t('roster.scopeStaff')
      : cls !== ALL
        ? t('roster.scopeClass', { cls: `${cls}${section !== ALL ? `-${section}` : ''}` })
        : t('roster.scopeAll');
    const next = new URLSearchParams({
      product: isStaff ? 'teacher-id-card' : 'student-id-card',
      qty: String(shown.length),
      note: t('roster.cardsNote', { scope, count: shown.length }),
    });
    navigate(`/institution/orders/new?${next}`);
  };

  const exportExcel = () =>
    void fetchFile(rosterExportUrl(kind), { fallbackName: `${isStaff ? 'staff' : 'students'}.xlsx`, mode: 'save' }).catch((e) => toast.error(getErrorMessage(e)));

  const confirmRemove = (p: Person) =>
    void confirmAction({
      tone: 'danger',
      title: t('roster.removeTitle', { name: p.name }),
      description: t('roster.removeDesc', { code: p.code }),
      confirmLabel: t('roster.remove'),
      action: () => remove.mutateAsync(p._id),
      successTitle: t('roster.removed'),
    });

  const place = (p: Person) =>
    isStaff
      ? [p.designation, p.department].filter(Boolean).join(' · ')
      : [p.class && `${p.class}${p.section ? `-${p.section}` : ''}`, p.rollNo && `${t('roster.roll')} ${p.rollNo}`].filter(Boolean).join(' · ');

  return (
    <div className="container-page py-8 sm:py-10">
      <PageNav items={[{ label: t('nav.dashboard'), to: '/institution' }, { label: t('roster.title') }]} />
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy sm:text-3xl">{t('roster.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('roster.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImporting(true)}>
            <IconFileSpreadsheet /> {t('roster.import')}
          </Button>
          <Button variant="outline" onClick={exportExcel} disabled={total === 0}>
            <IconDownload /> {t('roster.export')}
          </Button>
          {shown.length > 0 && (
            <Button variant="navy" onClick={orderCards}>
              <IconId /> {t('roster.orderCards', { count: shown.length })}
            </Button>
          )}
          <Button variant="brand" onClick={() => setEditing('new')}>
            <IconPlus /> {t(isStaff ? 'roster.addStaff' : 'roster.addStudent')}
          </Button>
        </div>
      </div>

      <div className="mb-5 inline-flex rounded-xl shadow-card bg-muted/40 p-1" role="tablist">
        {(['student', 'staff'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => {
              setKind(k);
              setCls(ALL);
              setSection(ALL);
            }}
            className={cn('flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-semibold', kind === k ? 'bg-brand-navy text-white' : 'text-muted-foreground hover:text-foreground')}
          >
            {k === 'student' ? <IconUsers className="size-4" /> : <IconUser className="size-4" />}
            {t(k === 'student' ? 'roster.students' : 'roster.staff')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : total === 0 ? (
        <EmptyState
          icon={<IconUsers />}
          title={t(isStaff ? 'roster.emptyStaff' : 'roster.empty')}
          description={t('roster.emptyDesc')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="brand" onClick={() => setImporting(true)}>
                <IconFileSpreadsheet /> {t('roster.import')}
              </Button>
              <Button variant="outline" onClick={() => setEditing('new')}>
                <IconPlus /> {t(isStaff ? 'roster.addStaff' : 'roster.addStudent')}
              </Button>
            </div>
          }
        />
      ) : (
        <>
          <Card className="mb-5 py-4">
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex-1">
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold text-brand-navy">{t('roster.photoProgress', { done, total })}</span>
                  <span className="text-muted-foreground">{t('roster.missingCount', { count: total - done })}</span>
                </div>
                <Progress value={total ? (done / total) * 100 : 0} />
              </div>
              <div className="flex flex-wrap gap-2">
                {firstMissing && (
                  <Button variant="navy" onClick={() => setPhotoFor(firstMissing._id)}>
                    <IconCamera /> {t('roster.takePhotos')}
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSharing(true)}>
                  <IconLink /> {t('photoLink.button')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('roster.search')} className="pl-9" />
            </div>
            {!isStaff && classes.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Select value={cls} onValueChange={(v) => { setCls(v); setSection(ALL); }}>
                  <SelectTrigger className="sm:w-36" aria-label={t('roster.fields.class')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t('roster.allClasses')}</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c} value={c}>{t('roster.classN', { cls: c })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={section} onValueChange={setSection}>
                  <SelectTrigger className="sm:w-36" aria-label={t('roster.fields.section')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t('roster.allSections')}</SelectItem>
                    {sections.map((s) => (
                      <SelectItem key={s} value={s}>{t('roster.sectionN', { section: s })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <button
              type="button"
              onClick={() => setMissingOnly((v) => !v)}
              aria-pressed={missingOnly}
              className={cn('h-11 rounded-xl shadow-card px-4 text-sm font-semibold', missingOnly ? 'border-primary bg-primary/8 text-primary' : 'text-muted-foreground')}
            >
              {t('roster.missingOnly')}
            </button>
            <span className="text-sm text-muted-foreground sm:ml-auto">{t('roster.showing', { shown: shown.length, total })}</span>
          </div>

          {/* Desktop: a table; phones: compact cards. */}
          <Card className="hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">{t('roster.photo')}</TableHead>
                  <TableHead>{t('roster.code')}</TableHead>
                  <TableHead>{t('roster.fields.name')}</TableHead>
                  {isStaff ? (
                    <>
                      <TableHead>{t('roster.fields.employeeId')}</TableHead>
                      <TableHead>{t('roster.fields.designation')}</TableHead>
                    </>
                  ) : (
                    <>
                      <TableHead>{t('roster.fields.fatherName')}</TableHead>
                      <TableHead>{t('roster.fields.class')}</TableHead>
                      <TableHead>{t('roster.fields.rollNo')}</TableHead>
                    </>
                  )}
                  <TableHead>{t('roster.fields.dob')}</TableHead>
                  <TableHead>{t('roster.fields.phone')}</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="py-1.5">
                      <Thumb person={p} onClick={() => setPhotoFor(p._id)} />
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold">{p.code}</TableCell>
                    <TableCell className="font-semibold text-brand-navy">{p.name}</TableCell>
                    {isStaff ? (
                      <>
                        <TableCell>{p.employeeId}</TableCell>
                        <TableCell>{[p.designation, p.department].filter(Boolean).join(' · ')}</TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{p.fatherName}</TableCell>
                        <TableCell>{p.class && `${p.class}${p.section ? `-${p.section}` : ''}`}</TableCell>
                        <TableCell>{p.rollNo}</TableCell>
                      </>
                    )}
                    <TableCell className="tabular-nums">{p.dob}</TableCell>
                    <TableCell className="tabular-nums">{p.phone}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(p)} aria-label={t('roster.edit')}>
                        <IconPencil />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => confirmRemove(p)} aria-label={t('roster.remove')}>
                        <IconTrash />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ul className="space-y-2 md:hidden">
            {shown.map((p) => (
              <li key={p._id} className="flex items-center gap-3 rounded-xl shadow-card bg-card p-2.5">
                <Thumb person={p} onClick={() => setPhotoFor(p._id)} className="w-12" />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(p)}>
                  <p className="truncate font-semibold text-brand-navy">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[place(p), p.fatherName].filter(Boolean).join(' · ')}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{p.code}</p>
                </button>
                <Button variant="ghost" size="icon" className="size-9 text-destructive" onClick={() => confirmRemove(p)} aria-label={t('roster.remove')}>
                  <IconTrash />
                </Button>
              </li>
            ))}
          </ul>

          <Button variant="outline" className="mt-4 w-full border-dashed" onClick={() => setEditing('new')}>
            <IconPlus /> {t(isStaff ? 'roster.addStaffEnd' : 'roster.addStudentEnd')}
          </Button>
        </>
      )}

      {editing && <PersonDialog kind={kind} person={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {importing && <ImportDialog kind={kind} onClose={() => setImporting(false)} />}
      {sharing && (
        <ShareLinkDialog kind={kind} cls={cls !== ALL ? cls : undefined} section={cls !== ALL && section !== ALL ? section : undefined} onClose={() => setSharing(false)} />
      )}
      {photoFor && <PhotoDialog people={shown.length ? shown : people} personId={photoFor} onPersonChange={setPhotoFor} onClose={() => setPhotoFor(null)} />}
    </div>
  );
}
