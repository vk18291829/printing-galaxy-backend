import { IconSearch, IconUserOff } from '@tabler/icons-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Pagination } from '@/components/common/pagination';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common/states';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useIsAdmin } from '@/features/auth/auth-store';
import { useCustomers, useToggleCustomer } from '@/features/management/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { getErrorMessage } from '@/lib/api-client';
import { formatDate, formatINR } from '@/lib/format';

export default function CustomersPage() {
  const isAdmin = useIsAdmin();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300) || undefined;
  const { data, isLoading, error, refetch } = useCustomers({ page, q });
  const toggle = useToggleCustomer();

  return (
    <div>
      <PageHeader title="Customers" description="Individuals who signed in with their phone or ordered at the counter." />
      <div className="relative mb-4">
        <IconSearch className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Name, phone or email"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
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
                    <TableHead className="pl-5">Customer</TableHead>
                    <TableHead className="hidden sm:table-cell">Orders</TableHead>
                    <TableHead>Spent</TableHead>
                    <TableHead className="hidden md:table-cell">Joined</TableHead>
                    <TableHead className="hidden lg:table-cell">Language</TableHead>
                    <TableHead className="pr-5">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((c) => (
                    <TableRow key={c._id}>
                      <TableCell className="pl-5">
                        <p className="font-medium">{c.name || '—'}</p>
                        <p className="text-xs text-muted-foreground">
                          +91 {c.phone}
                          {c.email ? ` · ${c.email}` : ''}
                        </p>
                      </TableCell>
                      <TableCell className="hidden tabular-nums sm:table-cell">{c.orders}</TableCell>
                      <TableCell className="font-medium tabular-nums">{formatINR(c.spent)}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{formatDate(c.createdAt)}</TableCell>
                      <TableCell className="hidden text-sm lg:table-cell">{c.language === 'hi' ? 'हिंदी' : 'English'}</TableCell>
                      <TableCell className="pr-5">
                        <Switch
                          checked={c.isActive}
                          disabled={!isAdmin}
                          onCheckedChange={(v) =>
                            toggle.mutate(
                              { id: c._id, isActive: v },
                              { onSuccess: () => toast.success(v ? 'Customer enabled' : 'Customer disabled'), onError: (e) => toast.error(getErrorMessage(e)) },
                            )
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
            </>
          ) : (
            <EmptyState icon={<IconUserOff />} title="No customers found" />
          )}
        </Card>
      )}
    </div>
  );
}
