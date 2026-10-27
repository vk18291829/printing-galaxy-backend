import { IconCheck, IconPencil, IconUserPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { confirmAction } from '@/components/common/confirm-dialog';
import { ErrorState, PageHeader, PageLoader, Spinner } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuthStore } from '@/features/auth/auth-store';
import { useSaveStaff, useStaff } from '@/features/management/api';
import { formatDate } from '@/lib/format';
import { STAFF_ROLE_INFO, STAFF_ROLES, type StaffRole } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { StaffMember } from '@/types/admin';

type Role = 'staff' | 'admin' | 'delivery';
const ROLE_LABEL: Record<Role, string> = { admin: 'Owner / admin', staff: 'Shop staff', delivery: 'Delivery' };

function StaffDialog({ member, onClose }: { member: StaffMember | 'new'; onClose: () => void }) {
  const save = useSaveStaff();
  const isNew = member === 'new';
  const [name, setName] = useState(isNew ? '' : member.name);
  const [email, setEmail] = useState(isNew ? '' : (member.email ?? ''));
  const [phone, setPhone] = useState(isNew ? '' : (member.phone ?? ''));
  const [role, setRole] = useState<Role>(isNew ? 'staff' : (member.role as Role));
  const [password, setPassword] = useState('');
  const [jobs, setJobs] = useState<StaffRole[]>(isNew ? ['counter'] : ((member.staffRoles as StaffRole[] | undefined) ?? []));
  const toggleJob = (r: StaffRole) => setJobs((j) => (j.includes(r) ? j.filter((x) => x !== r) : [...j, r]));
  const [isActive, setActive] = useState(isNew ? true : member.isActive);

  const submit = async () => {
    const data: Record<string, unknown> = isNew
      ? { name, email, role, password, ...(phone ? { phone } : {}), ...(role === 'staff' ? { staffRoles: jobs } : {}) }
      : { name, role, isActive, ...(password ? { password } : {}), ...(role === 'staff' ? { staffRoles: jobs } : {}) };
    const disabling = !isNew && member.isActive && !isActive;
    const ok = await confirmAction({
      tone: disabling ? 'danger' : 'default',
      title: isNew ? `Add ${name || 'this person'} as ${role}?` : `Save changes to ${member.name}?`,
      description: isNew
        ? `They can sign in to the admin panel with ${email || 'their email'} and the password you set.`
        : disabling
          ? 'Their account is switched off and they are signed out of the admin panel.'
          : password
            ? 'Their password is changed; they need the new one next time they sign in.'
            : 'Their name and role are updated straight away.',
      confirmLabel: isNew ? 'Add staff member' : 'Save changes',
      action: () => save.mutateAsync({ id: isNew ? undefined : member._id, data }),
      successTitle: isNew ? 'Staff member added' : 'Changes saved',
    });
    if (ok) onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add staff member' : `Edit ${member.name}`}</DialogTitle>
          <DialogDescription>Staff sign in to this admin panel with email and password.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {isNew && (
            <>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Mobile (optional)</Label>
                <Input inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {role === 'staff' && (
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-medium">Job roles (pick one or more)</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {STAFF_ROLES.map((r) => {
                  const on = jobs.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleJob(r)}
                      className={cn('rounded-lg border p-2.5 text-left transition-colors', on ? 'border-primary bg-primary/8' : 'hover:bg-accent')}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        <span className={cn('grid size-4 place-items-center rounded border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                          {on && <IconCheck className="size-3" stroke={3} />}
                        </span>
                        {STAFF_ROLE_INFO[r].label}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{STAFF_ROLE_INFO[r].does}</span>
                    </button>
                  );
                })}
              </div>
              {jobs.length === 0 && <p className="text-xs text-muted-foreground">No roles picked: they get counter and designer access.</p>}
            </fieldset>
          )}
          <div className="space-y-1.5">
            <Label>{isNew ? 'Password' : 'New password (leave empty to keep)'}</Label>
            <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="text-xs text-muted-foreground">At least 8 characters with a letter and a number.</p>
          </div>
          {!isNew && (
            <label className="flex items-center justify-between text-sm">
              Account active
              <Switch checked={isActive} onCheckedChange={setActive} />
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending || !name || (isNew && (!email || !password))}>
            {save.isPending && <Spinner className="size-4 text-current" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StaffPage() {
  const me = useAuthStore((s) => s.user?._id);
  const { data, isLoading, error, refetch } = useStaff();
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null);

  if (isLoading) return <PageLoader />;
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  return (
    <div>
      <PageHeader
        title="Staff"
        description="Who can sign in to the admin panel."
        actions={
          <Button onClick={() => setEditing('new')}>
            <IconUserPlus /> Add staff
          </Button>
        }
      />
      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((s) => (
              <TableRow key={s._id}>
                <TableCell className="pl-5">
                  <p className="font-medium">
                    {s.name} {s._id === me && <span className="text-xs text-muted-foreground">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{s.email}</p>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant={s.role === 'admin' ? 'soft' : 'outline'}>{ROLE_LABEL[s.role as Role]}</Badge>
                    {s.role === 'staff' &&
                      (s.staffRoles as StaffRole[] | undefined)?.map((r) => (
                        <Badge key={r} variant="secondary">{STAFF_ROLE_INFO[r]?.label ?? r}</Badge>
                      ))}
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{s.lastLoginAt ? formatDate(s.lastLoginAt, 'en', true) : 'Never'}</TableCell>
                <TableCell>{s.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Disabled</Badge>}</TableCell>
                <TableCell className="pr-5 text-right">
                  <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                    <IconPencil /> Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {editing && <StaffDialog member={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
