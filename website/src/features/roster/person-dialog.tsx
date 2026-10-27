import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getErrorMessage } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { KIND_FIELDS, useSavePerson, type Person, type PersonKind, type RosterField } from './api';

/** DD-MM-YYYY (stored) ⇄ YYYY-MM-DD (date input). */
const toInput = (dob?: string) => {
  const m = dob && /^(\d{2})-(\d{2})-(\d{4})$/.exec(dob);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};

const WIDE: RosterField[] = ['name', 'address'];

/**
 * Add or edit one person. "Save & add another" keeps the class and section, so a missed
 * student can be added to the end of a class quickly.
 */
export function PersonDialog({ kind, person, onClose }: { kind: PersonKind; person?: Person | null; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSavePerson();
  const fields = KIND_FIELDS[kind];
  const blank = () => Object.fromEntries(fields.map((f) => [f, ''])) as Record<RosterField, string>;
  const [values, setValues] = useState<Record<RosterField, string>>(() =>
    person ? { ...blank(), ...Object.fromEntries(fields.map((f) => [f, f === 'dob' ? toInput(person.dob) : person[f] ?? ''])) } : blank(),
  );
  const set = (f: RosterField, v: string) => setValues((s) => ({ ...s, [f]: v }));

  const submit = (another: boolean) => (e?: FormEvent) => {
    e?.preventDefault();
    if (!values.name.trim()) return toast.error(t('roster.nameRequired'));
    save.mutate(
      { id: person?._id, kind, fields: values },
      {
        onSuccess: (saved) => {
          toast.success(t(person ? 'roster.updated' : 'roster.added', { name: saved.name, code: saved.code }));
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
          <DialogTitle className="text-brand-navy">
            {person ? t('roster.editTitle', { code: person.code }) : t(kind === 'staff' ? 'roster.addStaff' : 'roster.addStudent')}
          </DialogTitle>
        </DialogHeader>
        <form id="person-form" onSubmit={submit(false)} className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f} className={cn('space-y-1.5', WIDE.includes(f) && 'sm:col-span-2')}>
              <Label htmlFor={`f-${f}`}>
                {t(`roster.fields.${f}`)}
                {f === 'name' && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                id={`f-${f}`}
                type={f === 'dob' ? 'date' : f === 'phone' ? 'tel' : 'text'}
                inputMode={f === 'phone' ? 'numeric' : undefined}
                value={values[f]}
                maxLength={f === 'name' ? 120 : 200}
                autoFocus={f === 'name'}
                onChange={(e) => set(f, e.target.value)}
              />
            </div>
          ))}
        </form>
        <DialogFooter className="gap-2">
          {!person && (
            <Button type="button" variant="outline" disabled={save.isPending} onClick={() => submit(true)()}>
              {t('roster.saveAndAdd')}
            </Button>
          )}
          <Button type="submit" form="person-form" variant="brand" disabled={save.isPending}>
            {save.isPending && <Spinner className="size-4 text-current" />} {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
