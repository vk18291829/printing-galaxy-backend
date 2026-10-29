import {
  IconCamera,
  IconChevronDown,
  IconDownload,
  IconFileSpreadsheet,
  IconFileZip,
  IconId,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { toast } from 'sonner';
import { MobileList, MobileRow } from '@/components/common/mobile-list';
import { confirmAction } from '@/components/common/confirm-dialog';
import { EmptyState, ErrorState, PageLoader, Spinner } from '@/components/common/states';
import { useBreadcrumbLabel } from '@/components/layout/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInstitution } from '@/features/management/api';
import {
  FIELD_LABELS,
  KIND_FIELDS,
  rosterBase,
  useRoster,
  useRosterActions,
  type ImportResult,
  type Person,
  type PersonKind,
  type RosterField,
} from '@/features/roster/api';
import { PhotoDialog } from '@/features/roster/photo-dialog';
import { getErrorMessage } from '@/lib/api-client';
import { fetchFile } from '@/lib/download';
import { cn } from '@/lib/utils';

const ALL = '__all';
/** Columns in the table (the edit form and Excel export have every field). */
const TABLE_FIELDS: Record<PersonKind, RosterField[]> = {
  student: ['name', 'fatherName', 'class', 'section', 'rollNo', 'dob', 'phone'],
  staff: ['name', 'employeeId', 'designation', 'department', 'dob', 'phone'],
};
type Actions = ReturnType<typeof useRosterActions>;

/** DD-MM-YYYY (stored) ⇄ YYYY-MM-DD (date input). */
const toInput = (dob?: string) => {
  const m = dob && /^(\d{2})-(\d{2})-(\d{4})$/.exec(dob);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

function PersonDialog({ kind, person, actions, onClose }: { kind: PersonKind; person: Person | null; actions: Actions; onClose: () => void }) {
  const fields = KIND_FIELDS[kind];
  const blank = () => Object.fromEntries(fields.map((f) => [f, ''])) as Record<RosterField, string>;
  const [values, setValues] = useState<Record<RosterField, string>>(() =>
    person ? { ...blank(), ...Object.fromEntries(fields.map((f) => [f, f === 'dob' ? toInput(person.dob) : person[f] ?? ''])) } : blank(),
  );

  const submit = (another: boolean) => (e?: FormEvent) => {
    e?.preventDefault();
    if (!values.name.trim()) return toast.error('Enter the name');
    actions.save.mutate(
      { id: person?._id, kind, fields: values },
      {
        onSuccess: (saved) => {
          toast.success(person ? `${saved.name} (${saved.code}) saved` : `${saved.name} added as ${saved.code}`);
          if (another) setValues({ ...blank(), class: values.class, section: values.section, session: values.session });
          else onClose();
        },
        onError: (err) => toast.error(getErrorMessage(err)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{person ? `Edit ${person.code}` : kind === 'staff' ? 'Add staff member' : 'Add student'}</DialogTitle>
        </DialogHeader>
        <form id="person-form" onSubmit={submit(false)} className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f} className={cn('space-y-1.5', (f === 'name' || f === 'address') && 'sm:col-span-2')}>
              <Label htmlFor={`f-${f}`}>
                {FIELD_LABELS[f]}
                {f === 'name' && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                id={`f-${f}`}
                type={f === 'dob' ? 'date' : f === 'phone' ? 'tel' : 'text'}
                value={values[f]}
                maxLength={f === 'name' ? 120 : 200}
                autoFocus={f === 'name'}
                onChange={(e) => setValues((s) => ({ ...s, [f]: e.target.value }))}
              />
            </div>
          ))}
        </form>
        <DialogFooter className="gap-2">
          {!person && (
            <Button type="button" variant="outline" disabled={actions.save.isPending} onClick={() => submit(true)()}>
              Save & add another
            </Button>
          )}
          <Button type="submit" form="person-form" disabled={actions.save.isPending}>
            {actions.save.isPending && <Spinner className="size-4 text-current" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ kind, actions, onClose }: { kind: PersonKind; actions: Actions; onClose: () => void }) {
  const [sheet, setSheet] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const run = actions.importSheet;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import {kind === 'staff' ? 'staff' : 'student'} list</DialogTitle>
          <DialogDescription>
            Excel (.xlsx) or CSV. Columns like Name, F. Name, DOB, Class, Section, Roll No are recognised. Matching people (admission no., or class + section + roll no.; employee ID for staff) are updated, not duplicated.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <div className="space-y-2 text-sm">
            <p>
              <b>{result.created}</b> added · <b>{result.updated}</b> updated · <b>{result.photos}</b> photos matched
            </p>
            {result.skipped.length > 0 && (
              <ul className="max-h-32 overflow-y-auto rounded-lg shadow-card border-warning/40 bg-warning/10 p-2 text-xs">
                {result.skipped.map((s) => (
                  <li key={`${s.row}-${s.reason}`}>Row {s.row}: {s.reason}</li>
                ))}
              </ul>
            )}
            {result.unknownColumns.length > 0 && <p className="text-xs text-muted-foreground">Columns not used: {result.unknownColumns.join(', ')}</p>}
          </div>
        ) : (
          <div className="grid gap-3">
            <Label className="grid gap-1.5">
              <span className="flex items-center gap-2"><IconFileSpreadsheet className="size-4" /> List (.xlsx or .csv)</span>
              <Input type="file" accept=".xlsx,.csv" onChange={(e) => setSheet(e.target.files?.[0] ?? null)} />
            </Label>
            <Label className="grid gap-1.5">
              <span className="flex items-center gap-2"><IconFileZip className="size-4" /> Photos ZIP (optional, named by roll no. or Photo column)</span>
              <Input type="file" accept=".zip" onChange={(e) => setPhotos(e.target.files?.[0] ?? null)} />
            </Label>
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : (
            <Button
              disabled={!sheet || run.isPending}
              onClick={() => sheet && run.mutate({ kind, sheet, photos }, { onSuccess: setResult, onError: (e) => toast.error(getErrorMessage(e)) })}
            >
              {run.isPending && <Spinner className="size-4 text-current" />} Import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Shop view of an institution's students and staff: edit, photograph and export for ID card printing. */
export default function InstitutionRosterPage() {
  const { id = '' } = useParams();
  const { data: institution } = useInstitution(id);
  useBreadcrumbLabel(institution?.name, `/institutions/${id}`);
  const [kind, setKind] = useState<PersonKind>('student');
  const { data, isLoading, error, refetch } = useRoster(id, kind);
  const actions = useRosterActions(id);
  const [q, setQ] = useState('');
  const [cls, setCls] = useState(ALL);
  const [section, setSection] = useState(ALL);
  const [missingOnly, setMissingOnly] = useState(false);
  const [editing, setEditing] = useState<Person | null | 'new'>(null);
  const [importing, setImporting] = useState(false);
  const [photoFor, setPhotoFor] = useState<string | null>(null);
  const [exporting, setExporting] = useState<'xlsx' | 'zip' | 'pdf' | null>(null);

  const people = data?.items ?? [];
  const classes = useMemo(() => [...new Set(people.map((p) => p.class).filter(Boolean))] as string[], [people]);
  const sections = useMemo(() => [...new Set(people.filter((p) => cls === ALL || p.class === cls).map((p) => p.section).filter(Boolean))] as string[], [people, cls]);
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
  // Exports follow the class filter, so one class can be printed at a time.
  const params = { kind, ...(cls !== ALL ? { class: cls } : {}), ...(cls !== ALL && section !== ALL ? { section } : {}) };
  const scope = cls !== ALL ? `class ${cls}` : `all ${isStaff ? 'staff' : 'students'}`;

  const download = async (type: 'xlsx' | 'zip' | 'pdf') => {
    setExporting(type);
    const file = { xlsx: 'export.xlsx', zip: 'photos.zip', pdf: 'cards.pdf' }[type];
    try {
      await fetchFile(`${rosterBase(id)}/${file}`, {
        params,
        fallbackName: `${kind}-${file}`,
        mode: 'save',
      });
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setExporting(null);
    }
  };

  const remove = (p: Person) =>
    void confirmAction({
      tone: 'danger',
      title: `Remove ${p.name}?`,
      description: `Their details and photo (${p.code}) are deleted.`,
      confirmLabel: 'Remove',
      action: () => actions.remove.mutateAsync(p._id),
      successTitle: 'Removed',
    });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-brand-navy sm:text-[1.75rem] dark:text-foreground">Students & staff</h1>
          <p className="text-sm text-muted-foreground">{institution?.name} · codes and photo names are ready for an ID card data merge.</p>
        </div>
        <Button className="shrink-0" onClick={() => setEditing('new')}>
          <IconPlus /> <span className="max-sm:sr-only">Add {isStaff ? 'staff' : 'student'}</span>
        </Button>
      </div>

      {/* One toolbar: who is listed on the left, getting data in and out on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-xl bg-secondary p-1">
          {(['student', 'staff'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setKind(k);
                setCls(ALL);
                setSection(ALL);
              }}
              className={cn(
                'h-8 rounded-lg px-4 text-sm font-medium transition-colors',
                kind === k ? 'bg-card text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {k === 'student' ? 'Students' : 'Staff'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImporting(true)}>
            <IconFileSpreadsheet /> Import
          </Button>
          {total > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={exporting !== null}>
                  {exporting ? <Spinner className="size-4" /> : <IconDownload />} Export <IconChevronDown className="opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Download {scope}</DropdownMenuLabel>
                <DropdownMenuItem onSelect={() => void download('xlsx')}>
                  <IconFileSpreadsheet /> Excel sheet
                </DropdownMenuItem>
                <DropdownMenuItem disabled={done === 0} onSelect={() => void download('zip')}>
                  <IconFileZip /> Photos ZIP{done === 0 && <span className="ml-auto text-xs text-muted-foreground">no photos yet</span>}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void download('pdf')}>
                  <IconId /> ID cards PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : total === 0 ? (
        <EmptyState
          icon={<IconFileSpreadsheet />}
          title={`No ${isStaff ? 'staff' : 'students'} yet`}
          description="Import the institution's Excel/CSV list or add people one by one."
        />
      ) : (
        <>
          <Card className="py-4">
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex-1">
                <div className="mb-1.5 flex justify-between text-sm">
                  <span className="font-medium">{done} of {total} photos done</span>
                  <span className="text-muted-foreground">{total - done} missing</span>
                </div>
                <Progress value={(done / total) * 100} />
              </div>
              {people.some((p) => !p.hasPhoto) && (
                <Button variant="outline" onClick={() => setPhotoFor((shown.find((p) => !p.hasPhoto) ?? people.find((p) => !p.hasPhoto))!._id)}>
                  <IconCamera /> Take photos
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, roll no." className="pl-9" />
            </div>
            {!isStaff && classes.length > 0 && (
              <>
                <Select value={cls} onValueChange={(v) => { setCls(v); setSection(ALL); }}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All classes</SelectItem>
                    {classes.map((c) => <SelectItem key={c} value={c}>Class {c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={section} onValueChange={setSection}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All sections</SelectItem>
                    {sections.map((s) => <SelectItem key={s} value={s}>Section {s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
            <Button variant={missingOnly ? 'default' : 'outline'} onClick={() => setMissingOnly((v) => !v)}>
              Missing photo
            </Button>
            <span className="ml-auto text-sm text-muted-foreground">{shown.length} of {total}</span>
          </div>

          <Card className="py-0">
            <MobileList>
              {shown.map((p) => (
                <MobileRow
                  key={p._id}
                  leading={
                    <button
                      type="button"
                      onClick={() => setPhotoFor(p._id)}
                      aria-label={`Photo of ${p.name}`}
                      className={cn('grid aspect-[3/4] w-11 place-items-center overflow-hidden rounded shadow-card', !p.hasPhoto && 'border-dashed text-muted-foreground')}
                    >
                      {p.photoUrl ? <img src={p.photoUrl} alt="" loading="lazy" className="size-full object-cover" /> : <IconCamera className="size-4" />}
                    </button>
                  }
                  title={p.name}
                  subtitle={<span className="font-mono">{p.code}</span>}
                  meta={TABLE_FIELDS[kind]
                    .filter((f) => f !== 'name' && p[f])
                    .map((f) => (
                      <span key={f}>
                        {FIELD_LABELS[f]}: <span className="text-foreground">{p[f]}</span>
                      </span>
                    ))}
                  actions={[
                    { label: 'Edit', icon: <IconPencil />, onSelect: () => setEditing(p) },
                    { label: p.hasPhoto ? 'Change photo' : 'Add photo', icon: <IconCamera />, onSelect: () => setPhotoFor(p._id) },
                    { label: 'Remove', icon: <IconTrash />, destructive: true, onSelect: () => remove(p) },
                  ]}
                />
              ))}
            </MobileList>
            <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Photo</TableHead>
                  <TableHead>Code</TableHead>
                  {TABLE_FIELDS[kind].map((f) => (
                    <TableHead key={f}>{FIELD_LABELS[f]}</TableHead>
                  ))}
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((p) => (
                  <TableRow key={p._id}>
                    <TableCell className="py-1.5">
                      <button
                        type="button"
                        onClick={() => setPhotoFor(p._id)}
                        aria-label={`Photo of ${p.name}`}
                        className={cn('grid aspect-[3/4] w-10 place-items-center overflow-hidden rounded shadow-card', !p.hasPhoto && 'border-dashed text-muted-foreground')}
                      >
                        {p.photoUrl ? <img src={p.photoUrl} alt="" loading="lazy" className="size-full object-cover" /> : <IconCamera className="size-4" />}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-semibold">{p.code}</TableCell>
                    {TABLE_FIELDS[kind].map((f) => (
                      <TableCell key={f} className={f === 'name' ? 'font-medium' : undefined}>{p[f]}</TableCell>
                    ))}
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => setEditing(p)} aria-label="Edit">
                        <IconPencil />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => remove(p)} aria-label="Remove">
                        <IconTrash />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </Card>
        </>
      )}

      {editing && <PersonDialog kind={kind} person={editing === 'new' ? null : editing} actions={actions} onClose={() => setEditing(null)} />}
      {importing && <ImportDialog kind={kind} actions={actions} onClose={() => setImporting(false)} />}
      {photoFor && (
        <PhotoDialog people={shown.length ? shown : people} personId={photoFor} onPersonChange={setPhotoFor} onClose={() => setPhotoFor(null)} save={actions.setPhoto} />
      )}
    </div>
  );
}
