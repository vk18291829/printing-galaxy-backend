import { IconCircleCheck, IconDownload, IconFileSpreadsheet, IconFileZip } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/api-client';
import { useImportRoster, type ImportResult, type PersonKind } from './api';

const TEMPLATES: Record<PersonKind, { columns: string[]; sample: string[] }> = {
  student: {
    columns: ['Name', "Father's Name", "Mother's Name", 'Date of Birth', 'Class', 'Section', 'Roll No', 'Admission No', 'Blood Group', 'Phone', 'Address', 'Photo'],
    sample: ['Asha Verma', 'Ramesh Verma', 'Sunita Verma', '09-05-2015', '5', 'A', '1', 'A-1021', 'B+', '9876543210', '"12 Civil Lines, Jhansi"', '1.jpg'],
  },
  staff: {
    columns: ['Name', 'Employee ID', 'Designation', 'Department', 'Qualification', "Father's Name", 'Date of Birth', 'Blood Group', 'Phone', 'Address', 'Photo'],
    sample: ['Meena Sharma', 'T-014', 'PGT', 'Science', '"M.Sc., B.Ed."', 'Om Prakash Sharma', '12-03-1988', 'O+', '9876500011', '"Sipri Bazar, Jhansi"', 'T-014.jpg'],
  },
};

function downloadTemplate(kind: PersonKind) {
  const { columns, sample } = TEMPLATES[kind];
  const url = URL.createObjectURL(new Blob([`${columns.join(',')}\n${sample.join(',')}\n`], { type: 'text/csv' }));
  Object.assign(document.createElement('a'), { href: url, download: `${kind}-list-template.csv` }).click();
  URL.revokeObjectURL(url);
}

function FilePick({ icon, label, hint, accept, file, onFile }: { icon: React.ReactNode; label: string; hint: string; accept: string; file: File | null; onFile: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-brand-navy">{file ? file.name : label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      {file && <IconCircleCheck className="size-5 shrink-0 text-success" />}
      <input ref={ref} type="file" accept={accept} hidden onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
    </button>
  );
}

/** Upload an Excel/CSV list, optionally with a ZIP of photos, and show what happened. */
export function ImportDialog({ kind, onClose }: { kind: PersonKind; onClose: () => void }) {
  const { t } = useTranslation();
  const run = useImportRoster();
  const [sheet, setSheet] = useState<File | null>(null);
  const [photos, setPhotos] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const start = () =>
    sheet &&
    run.mutate(
      { kind, sheet, photos },
      { onSuccess: setResult, onError: (e) => toast.error(getErrorMessage(e)) },
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[95dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">{t(kind === 'staff' ? 'roster.importStaffTitle' : 'roster.importTitle')}</DialogTitle>
          <DialogDescription>{t('roster.importDesc')}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 divide-x rounded-xl border text-center">
              {[
                [t('roster.result.created'), result.created],
                [t('roster.result.updated'), result.updated],
                [t('roster.result.photos'), result.photos],
              ].map(([label, n]) => (
                <div key={label} className="p-3">
                  <p className="text-xl font-bold text-brand-navy tabular-nums">{n}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            {result.skipped.length > 0 && (
              <div className="rounded-xl border border-warning/40 bg-warning/10 p-3">
                <p className="mb-1 font-semibold">{t('roster.result.skipped', { count: result.skipped.length })}</p>
                <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs">
                  {result.skipped.map((s) => (
                    <li key={`${s.row}-${s.reason}`}>{t('roster.result.row', { row: s.row, reason: s.reason })}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.unknownColumns.length > 0 && (
              <p className="text-xs text-muted-foreground">{t('roster.result.unknown', { columns: result.unknownColumns.join(', ') })}</p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <FilePick
              icon={<IconFileSpreadsheet />}
              label={t('roster.pickSheet')}
              hint={t('roster.pickSheetHint')}
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              file={sheet}
              onFile={setSheet}
            />
            <FilePick icon={<IconFileZip />} label={t('roster.pickZip')} hint={t('roster.pickZipHint')} accept=".zip,application/zip" file={photos} onFile={setPhotos} />
            <Button variant="ghost" size="sm" onClick={() => downloadTemplate(kind)}>
              <IconDownload /> {t('roster.template')}
            </Button>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button variant="brand" onClick={onClose}>
              {t('roster.done')}
            </Button>
          ) : (
            <Button variant="brand" disabled={!sheet || run.isPending} onClick={start}>
              {run.isPending && <Spinner className="size-4 text-current" />} {t('roster.importNow')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
