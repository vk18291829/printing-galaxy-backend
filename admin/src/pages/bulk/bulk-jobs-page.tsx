import { IconFileSpreadsheet } from '@tabler/icons-react';
import { useNavigate, useSearchParams } from 'react-router';
import { Pagination } from '@/components/common/pagination';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common/states';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BULK_STATUS_LABEL, BulkStatusBadge, CARD_KIND_LABEL } from '@/features/operations/bulk-status';
import { useBulkJobs } from '@/features/operations/api';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BulkStatus } from '@/types/admin';

const TABS: (BulkStatus | 'all')[] = ['all', 'needs_fixes', 'ready', 'ordered', 'failed'];

export default function BulkJobsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as BulkStatus | null) ?? undefined;
  const page = Number(params.get('page') ?? 1);
  const { data, isLoading, error, refetch } = useBulkJobs({ page, status });

  return (
    <div>
      <PageHeader
        title="Bulk card lists"
        description="Class lists and photo ZIPs uploaded by institutions, checked and turned into print sheets automatically."
      />
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl shadow-card bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setParams(t === 'all' ? {} : { status: t }, { replace: true })}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground',
              (status ?? 'all') === t && 'bg-primary/10 text-primary',
            )}
          >
            {t === 'all' ? 'All' : BULK_STATUS_LABEL[t]}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <Card className="gap-0 py-0">
          {isLoading ? (
            <div className="grid h-64 place-items-center">
              <Spinner />
            </div>
          ) : data?.items.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Institution</TableHead>
                    <TableHead>Card</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="hidden md:table-cell">Order</TableHead>
                    <TableHead className="hidden sm:table-cell">Uploaded</TableHead>
                    <TableHead className="pr-5">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((j) => (
                    <TableRow key={j._id} className="cursor-pointer" onClick={() => navigate(`/bulk-jobs/${j._id}`)}>
                      <TableCell className="pl-5 font-medium">{j.institution?.name ?? '—'}</TableCell>
                      <TableCell>
                        <p>{CARD_KIND_LABEL[j.kind]}</p>
                        <p className="text-xs text-muted-foreground">{j.template?.name}</p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(j.report.validRows)}/{formatNumber(j.report.rows)}
                      </TableCell>
                      <TableCell className="hidden font-mono text-sm md:table-cell">{j.order?.orderNumber ?? '—'}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{formatDate(j.createdAt, 'en', true)}</TableCell>
                      <TableCell className="pr-5">
                        <BulkStatusBadge status={j.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={data.page}
                pages={data.pages}
                total={data.total}
                onPage={(p) => setParams({ ...(status ? { status } : {}), page: String(p) })}
              />
            </>
          ) : (
            <EmptyState icon={<IconFileSpreadsheet />} title="No uploads yet" description="Institutions upload lists from their dashboard on the website." />
          )}
        </Card>
      )}
    </div>
  );
}
