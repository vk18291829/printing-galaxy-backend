import { IconHistory } from '@tabler/icons-react';
import { useState } from 'react';
import { MobileList, MobileRow } from '@/components/common/mobile-list';
import { Pagination } from '@/components/common/pagination';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAudit } from '@/features/management/api';
import { formatDate } from '@/lib/format';

const FILTERS = [
  { value: 'all', label: 'All activity' },
  { value: 'order', label: 'Orders' },
  { value: 'payment', label: 'Payments' },
  { value: 'product', label: 'Products & prices' },
  { value: 'institution', label: 'Institutions' },
  { value: 'staff', label: 'Staff' },
  { value: 'settings', label: 'Settings' },
];

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('all');
  const { data, isLoading, error, refetch } = useAudit({ page, action: action === 'all' ? undefined : action });

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Who changed an order status, a price or an account — and when."
        actions={
          <Select
            value={action}
            onValueChange={(v) => {
              setAction(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
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
              <MobileList>
                {data.items.map((e) => (
                  <MobileRow
                    key={e._id}
                    title={<span className="font-medium whitespace-normal">{e.summary ?? e.entity}</span>}
                    subtitle={`${e.actorName ?? 'System'}${e.actor?.role ? ` · ${e.actor.role}` : ''} · ${formatDate(e.createdAt, 'en', true)}`}
                    meta={
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {e.action}
                      </Badge>
                    }
                  />
                ))}
              </MobileList>
              <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">When</TableHead>
                    <TableHead className="hidden sm:table-cell">Who</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="pr-5">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((e) => (
                    <TableRow key={e._id}>
                      <TableCell className="pl-5 text-sm text-muted-foreground">{formatDate(e.createdAt, 'en', true)}</TableCell>
                      <TableCell className="hidden text-sm sm:table-cell">
                        {e.actorName ?? 'System'}
                        {e.actor?.role && <span className="text-xs text-muted-foreground"> · {e.actor.role}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {e.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate pr-5 text-sm" title={e.summary}>
                        {e.summary ?? e.entity}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
            </>
          ) : (
            <EmptyState icon={<IconHistory />} title="No activity yet" />
          )}
        </Card>
      )}
    </div>
  );
}
