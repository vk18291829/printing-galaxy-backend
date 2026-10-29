import { IconDownload, IconReportAnalytics } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, ErrorState, PageHeader, Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RevenueChart } from '@/features/dashboard/revenue-chart';
import { useReport, type ReportParams, type ReportType } from '@/features/operations/api';
import { getErrorMessage } from '@/lib/api-client';
import { fetchFile } from '@/lib/download';
import { formatINR, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ReportData } from '@/types/admin';

const REPORTS: { type: ReportType; label: string; description: string; dated: boolean }[] = [
  { type: 'sales', label: 'Sales', description: 'Orders, sales and collections by day or month (cancelled orders excluded).', dated: true },
  { type: 'products', label: 'Top products', description: 'What sells most in the period.', dated: true },
  { type: 'pending-payments', label: 'Pending payments', description: 'Every open balance today, oldest first. Not limited by dates.', dated: false },
  { type: 'institutions', label: 'Institutions', description: 'Orders and balances per school, college or business.', dated: true },
  { type: 'staff', label: 'Staff workload', description: 'Orders handled and deliveries per person.', dated: true },
];

const iso = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000));

function presets() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return [
    { label: 'Today', from: iso(now), to: iso(now) },
    { label: '7 days', from: daysAgo(6), to: iso(now) },
    { label: '30 days', from: daysAgo(29), to: iso(now) },
    { label: 'This month', from: iso(monthStart), to: iso(now) },
    { label: 'Last month', from: iso(lastMonthStart), to: iso(lastMonthEnd) },
    { label: 'This FY', from: `${fyStartYear}-04-01`, to: iso(now) },
  ];
}

/** Money columns are the ones whose label says (Rs). */
const isMoney = (label: string) => label.includes('(Rs)');

function cell(value: string | number | null, label: string) {
  if (value === null || value === '') return '—';
  if (typeof value === 'number') return isMoney(label) ? formatINR(value) : label.endsWith('%') ? `${value}%` : formatNumber(value);
  return value;
}

function SalesChart({ data, groupBy, from, to }: { data: ReportData; groupBy: 'day' | 'month'; from: string; to: string }) {
  const points = useMemo(() => {
    const byKey = new Map(data.rows.map((r) => [String(r.period), r]));
    const keys: string[] = [];
    if (groupBy === 'day') {
      for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= new Date(`${to}T00:00:00Z`).getTime(); t += 86_400_000) {
        keys.push(new Date(t).toISOString().slice(0, 10));
      }
    } else {
      const [fy, fm] = from.split('-').map(Number) as [number, number];
      const [ty, tm] = to.split('-').map(Number) as [number, number];
      for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? ((m = 1), (y += 1)) : (m += 1)) {
        keys.push(`${y}-${String(m).padStart(2, '0')}`);
      }
    }
    return keys.map((k) => ({ date: k, revenue: Number(byKey.get(k)?.revenue ?? 0), orders: Number(byKey.get(k)?.orders ?? 0) }));
  }, [data, groupBy, from, to]);

  if (points.length < 2 || points.length > 400) return null;
  const monthLabel = (k: string) => new Date(`${k}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Sales by {groupBy}</CardTitle>
      </CardHeader>
      <CardContent>
        <RevenueChart data={points} formatLabel={groupBy === 'month' ? monthLabel : undefined} caption={`Sales by ${groupBy}`} />
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams();
  const type = (params.get('type') as ReportType | null) ?? 'sales';
  const report = REPORTS.find((r) => r.type === type) ?? REPORTS[0]!;
  const [from, setFrom] = useState(params.get('from') ?? daysAgo(29));
  const [to, setTo] = useState(params.get('to') ?? iso(new Date()));
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day');
  const [exporting, setExporting] = useState(false);

  const query: ReportParams = report.dated ? { from, to, ...(type === 'sales' ? { groupBy } : {}) } : {};
  const { data, isLoading, isFetching, error, refetch } = useReport(type, query);

  const exportCsv = () => {
    setExporting(true);
    fetchFile(`/admin/reports/${type}`, { params: { ...query, format: 'csv' }, fallbackName: `${type}.csv`, mode: 'save' })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => setExporting(false));
  };

  const visibleColumns = data?.columns.filter((c) => c.key !== 'id') ?? [];
  const linkFor = (row: Record<string, unknown>) =>
    type === 'pending-payments' ? `/orders/${row.id}` : type === 'institutions' ? `/institutions/${row.id}` : null;

  return (
    <div>
      <PageHeader icon={<IconReportAnalytics />}
        title="Reports"
        description="Sales, products, dues and workload. Export any report as CSV for Excel or your accountant."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={exporting || !data?.rows.length}>
            {exporting ? <Spinner className="size-4 text-current" /> : <IconDownload />} Export CSV
          </Button>
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl shadow-card bg-card p-1">
        {REPORTS.map((r) => (
          <button
            key={r.type}
            onClick={() => setParams({ type: r.type }, { replace: true })}
            className={cn(
              'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground',
              type === r.type && 'bg-primary/10 text-primary',
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <p className="mb-4 text-sm text-muted-foreground">{report.description}</p>

      {report.dated && (
        <Card className="mb-6 py-4">
          <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="grid grid-cols-2 gap-3 sm:flex">
              <div className="space-y-1.5">
                <Label htmlFor="from">From</Label>
                <Input id="from" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to">To</Label>
                <Input id="to" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presets().map((p) => (
                <Button
                  key={p.label}
                  size="sm"
                  variant={from === p.from && to === p.to ? 'default' : 'outline'}
                  onClick={() => {
                    setFrom(p.from);
                    setTo(p.to);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            {type === 'sales' && (
              <div className="flex gap-1 rounded-lg shadow-card p-1 lg:ml-auto">
                {(['day', 'month'] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGroupBy(g)}
                    className={cn('rounded-md px-3 py-1 text-sm capitalize', groupBy === g ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground')}
                  >
                    By {g}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading || !data ? (
        <div className="grid h-64 place-items-center">
          <Spinner />
        </div>
      ) : (
        <>
          {type === 'sales' && data.rows.length > 0 && <SalesChart data={data} groupBy={groupBy} from={from} to={to} />}
          <Card className={cn('gap-0 py-0 transition-opacity', isFetching && 'opacity-60')}>
            {data.rows.length === 0 ? (
              <EmptyState icon={<IconReportAnalytics />} title="Nothing in this period" description="Try a wider date range." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {visibleColumns.map((c, i) => (
                      <TableHead
                        key={c.key}
                        className={cn(i === 0 && 'pl-5', i === visibleColumns.length - 1 && 'pr-5', typeof data.rows[0]?.[c.key] === 'number' && 'text-right')}
                      >
                        {c.label.replace(' (Rs)', '')}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row, r) => {
                    const href = linkFor(row);
                    return (
                      <TableRow key={r}>
                        {visibleColumns.map((c, i) => (
                          <TableCell
                            key={c.key}
                            className={cn(
                              'whitespace-nowrap',
                              i === 0 && 'pl-5 font-medium',
                              i === visibleColumns.length - 1 && 'pr-5',
                              typeof row[c.key] === 'number' && 'text-right tabular-nums',
                              c.key === 'due' && Number(row[c.key]) > 0 && 'font-semibold text-destructive',
                            )}
                          >
                            {i === 0 && href ? (
                              <Link to={href} className="hover:text-primary hover:underline">
                                {cell(row[c.key] ?? null, c.label)}
                              </Link>
                            ) : (
                              cell(row[c.key] ?? null, c.label)
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
                {data.summary && (
                  <TableFooter>
                    <TableRow>
                      {visibleColumns.map((c, i) => {
                        const v = data.summary?.[c.key];
                        return (
                          <TableCell key={c.key} className={cn('font-semibold', i === 0 && 'pl-5', i === visibleColumns.length - 1 && 'pr-5', v !== undefined && 'text-right tabular-nums')}>
                            {i === 0 ? 'Total' : v !== undefined ? cell(v, c.label) : ''}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
