import {
  IconAlertCircle,
  IconAlertTriangle,
  IconDownload,
  IconEye,
  IconFileTypePdf,
  IconRefresh,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { ErrorState, PageLoader, Spinner } from '@/components/common/states';
import { useBreadcrumbLabel } from '@/components/layout/breadcrumbs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BulkStatusBadge, CARD_KIND_LABEL } from '@/features/operations/bulk-status';
import { useBulkJob, useRerunBulkJob } from '@/features/operations/api';
import { openFile } from '@/features/orders/api';
import { getErrorMessage } from '@/lib/api-client';
import { fetchFile } from '@/lib/download';
import { formatDate, formatFileSize, formatNumber } from '@/lib/format';
import type { BulkIssue } from '@/types/admin';

const COLUMN_LABEL: Record<string, string> = {
  name: 'Name', rollNo: 'Roll no.', admissionNo: 'Adm. no.', employeeId: 'Emp. ID', class: 'Class', section: 'Sec.',
  fatherName: "Father's name", motherName: "Mother's name", dob: 'DOB', bloodGroup: 'Blood', phone: 'Phone',
  address: 'Address', designation: 'Designation', department: 'Dept.', session: 'Session', route: 'Route', photo: 'Photo',
};

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Issues({ title, items, tone }: { title: string; items: BulkIssue[]; tone: 'error' | 'warning' }) {
  if (!items.length) return null;
  const Icon = tone === 'error' ? IconAlertCircle : IconAlertTriangle;
  return (
    <Card className={tone === 'error' ? 'border-destructive/40' : 'border-warning/40'}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className={tone === 'error' ? 'size-5 text-destructive' : 'size-5 text-amber-600 dark:text-warning'} />
          {title} ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="max-h-80 space-y-1.5 overflow-y-auto text-sm">
          {items.map((issue, i) => (
            <li key={i} className="flex gap-3">
              <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{issue.row ? `Row ${issue.row}` : 'File'}</span>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function BulkJobDetailPage() {
  const { id = '' } = useParams();
  const { data: job, isLoading, error, refetch } = useBulkJob(id);
  const rerun = useRerunBulkJob(id);
  useBreadcrumbLabel(job?.institution?.name);

  if (isLoading) return <PageLoader />;
  if (error || !job) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const busy = ['queued', 'validating', 'generating'].includes(job.status);
  const output = typeof job.output?.file === 'object' ? job.output.file : null;
  const columns = job.report.columns.filter((c) => c !== 'photo');
  const run = (step: 'validate' | 'generate') =>
    rerun.mutate(step, {
      onSuccess: () => toast.success(step === 'validate' ? 'Checking the list again' : 'Rebuilding the print sheet'),
      onError: (e) => toast.error(getErrorMessage(e)),
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{job.institution?.name}</h1>
            <BulkStatusBadge status={job.status} />
            {busy && <Spinner className="size-4" />}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {CARD_KIND_LABEL[job.kind]} · template “{job.template?.name}” · uploaded {formatDate(job.createdAt, 'en', true)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {job.template && (
            <Button
              variant="outline"
              onClick={() =>
                void fetchFile(`/admin/bulk-jobs/templates/${job.template!._id}/sample`, { fallbackName: 'sample.pdf', mode: 'open' }).catch((e) =>
                  toast.error(getErrorMessage(e)),
                )
              }
            >
              <IconEye /> Template sample
            </Button>
          )}
          <Button variant="outline" disabled={busy || rerun.isPending || job.status === 'ordered'} onClick={() => run('validate')}>
            <IconRefresh /> Re-check list
          </Button>
          <Button variant="outline" disabled={busy || rerun.isPending || !job.report.rows || job.status === 'needs_fixes'} onClick={() => run('generate')}>
            <IconFileTypePdf /> Rebuild sheet
          </Button>
        </div>
      </div>

      {job.status === 'failed' && job.error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <p className="font-semibold text-destructive">Processing failed (attempt {job.attempts})</p>
          <p className="mt-1">{job.error}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Rows in list" value={formatNumber(job.report.rows)} sub={`${formatNumber(job.report.validRows)} without errors`} />
        <Stat label="Photos" value={`${formatNumber(job.report.photosMatched)}/${formatNumber(job.report.photosInZip)}`} sub="matched / in ZIP" />
        <Stat label="Print sheet" value={job.output?.sheets ? `${job.output.sheets} × A4` : '—'} sub={job.output?.cards ? `${job.output.cards} cards, front + back` : undefined} />
        <Stat
          label="Order"
          value={
            job.order ? (
              <Link to={`/orders/${job.order._id}`} className="font-mono text-primary hover:underline">
                {job.order.orderNumber}
              </Link>
            ) : (
              '—'
            )
          }
          sub={job.order ? job.order.status.replace(/_/g, ' ') : 'Not ordered yet'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {[job.dataFile, job.photosFile].map(
            (f) =>
              f && (
                <Button key={f._id} variant="outline" size="sm" disabled={f.status === 'deleted'} onClick={() => void openFile(f._id).catch((e) => toast.error(getErrorMessage(e)))}>
                  <IconDownload /> <span className="max-w-48 truncate">{f.originalName}</span>
                  <span className="text-xs text-muted-foreground">{f.status === 'deleted' ? 'deleted' : formatFileSize(f.size)}</span>
                </Button>
              ),
          )}
          {output && (
            <Button size="sm" disabled={output.status === 'deleted'} onClick={() => void openFile(output._id).catch((e) => toast.error(getErrorMessage(e)))}>
              <IconFileTypePdf /> Print sheet PDF
              <span className="text-xs opacity-80">{formatFileSize(output.size)}</span>
            </Button>
          )}
        </CardContent>
      </Card>

      <Issues title="Errors" items={job.report.errors} tone="error" />
      <Issues title="Warnings" items={job.report.warnings} tone="warning" />

      {job.preview.length > 0 && (
        <Card className="gap-0 pb-0">
          <CardHeader className="pb-4">
            <CardTitle>First {job.preview.length} rows as read</CardTitle>
            {job.report.ignoredColumns.length > 0 && (
              <p className="text-sm text-muted-foreground">Ignored columns: {job.report.ignoredColumns.join(', ')}</p>
            )}
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Row</TableHead>
                {columns.map((c) => (
                  <TableHead key={c}>{COLUMN_LABEL[c] ?? c}</TableHead>
                ))}
                <TableHead className="pr-5">Photo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {job.preview.map((r) => (
                <TableRow key={r.row}>
                  <TableCell className="pl-5 text-muted-foreground tabular-nums">{r.row}</TableCell>
                  {columns.map((c) => (
                    <TableCell key={c} className="max-w-56 truncate">
                      {r.data[c] ?? ''}
                    </TableCell>
                  ))}
                  <TableCell className="pr-5 text-xs text-muted-foreground">{r.photo ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
