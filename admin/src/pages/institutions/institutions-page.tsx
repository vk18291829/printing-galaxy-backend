import { IconBuildingOff, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Pagination } from '@/components/common/pagination';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common/states';
import { InstitutionStatusBadge } from '@/components/common/status-badge';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useInstitutions } from '@/features/management/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { InstitutionStatus } from '@/types/api';

const TABS: (InstitutionStatus | 'all')[] = ['pending', 'approved', 'rejected', 'suspended', 'all'];

export default function InstitutionsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as InstitutionStatus | 'all' | null) ?? 'all';
  const page = Number(params.get('page') ?? 1);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300) || undefined;
  const { data, isLoading, error, refetch } = useInstitutions({ page, q, status: status === 'all' ? undefined : status });

  return (
    <div>
      <PageHeader title="Institutions" description="Schools, colleges and businesses. Approve accounts to unlock institution prices." />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <div className="flex gap-1 overflow-x-auto rounded-xl shadow-card bg-card p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setParams(t === 'all' ? {} : { status: t }, { replace: true })}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground capitalize hover:text-foreground',
                status === t && 'bg-primary/10 text-primary',
              )}
            >
              {t}
              {t !== 'all' && data?.statusCounts[t] ? (
                <Badge variant={t === 'pending' ? 'warning' : 'secondary'} className="px-1.5 py-0 text-[10px]">
                  {data.statusCounts[t]}
                </Badge>
              ) : null}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Name, email, phone or city" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
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
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead className="hidden lg:table-cell">City</TableHead>
                    <TableHead className="hidden sm:table-cell">Registered</TableHead>
                    <TableHead className="pr-5">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((i) => (
                    <TableRow key={i._id} className="cursor-pointer" onClick={() => navigate(`/institutions/${i._id}`)}>
                      <TableCell className="pl-5">
                        <p className="font-medium">{i.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {i.type}
                          {i.size ? ` · ${i.size} people` : ''}
                        </p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-sm">{i.contactName}</p>
                        <p className="text-xs text-muted-foreground">
                          {i.phone} · {i.email}
                        </p>
                      </TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">{i.address?.city}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{formatDate(i.createdAt)}</TableCell>
                      <TableCell className="pr-5">
                        <InstitutionStatusBadge status={i.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={data.page} pages={data.pages} total={data.total} onPage={(p) => setParams({ ...(status !== 'all' ? { status } : {}), page: String(p) })} />
            </>
          ) : (
            <EmptyState icon={<IconBuildingOff />} title="No institutions here" />
          )}
        </Card>
      )}
    </div>
  );
}
