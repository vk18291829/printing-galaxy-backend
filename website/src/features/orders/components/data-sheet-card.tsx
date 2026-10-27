import { IconCircleCheck, IconDownload, IconFileSpreadsheet, IconSend } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Spinner } from '@/components/common/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CartFile } from '@/features/cart/cart-store';
import { useProduct } from '@/features/catalog/api';
import { FileUploader } from '@/features/uploads/file-uploader';
import { fileExtension } from '@/features/uploads/upload-file';
import { getErrorMessage } from '@/lib/api-client';
import { useLocalized } from '@/lib/i18n';
import type { Order, OrderItem, UploadedFile } from '@/types/api';
import { useAddItemFiles } from '../api';

const SHEET_TYPES = ['xlsx', 'xls', 'csv'];
/** Photos usually come as one ZIP next to the sheet. */
const ACCEPTED = [...SHEET_TYPES, 'zip'];
/** Until printing starts, the shop can still use new data. */
const OPEN_STATUSES = ['received', 'proof_sent', 'approved'];

const TEMPLATE_COLUMNS = ['Name', 'Class', 'Section', 'Roll No', "Father's Name", 'Date of Birth', 'Blood Group', 'Phone', 'Address', 'Photo file name'];

function downloadTemplate() {
  const csv = `${TEMPLATE_COLUMNS.join(',')}\nAsha Verma,5,A,12,Ramesh Verma,2015-04-12,B+,9876543210,"12 Civil Lines, Jhansi",asha-verma.jpg\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: 'student-data-template.csv' });
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Asks an institution for the data sheet (names, classes, photos) once the order is confirmed:
 * after "Create order", or after accepting a quote. Shown only for products printed from a list.
 */
export function DataSheetCard({ order, item }: { order: Order; item: OrderItem }) {
  const { t } = useTranslation();
  const l = useLocalized();
  const { data: product } = useProduct(item.productSlug);
  const add = useAddItemFiles(order._id);
  const [files, setFiles] = useState<CartFile[]>([]);

  const takesSheet = product?.acceptedFileTypes.some((type) => SHEET_TYPES.includes(type));
  if (!takesSheet || !OPEN_STATUSES.includes(order.status)) return null;

  const sent = item.files.filter(
    (f): f is UploadedFile => typeof f !== 'string' && f.status !== 'deleted' && SHEET_TYPES.includes(fileExtension(f.originalName)),
  );
  const done = sent.length > 0;

  const send = () =>
    add.mutate(
      { itemId: item._id, fileIds: files.map((f) => f.id) },
      {
        onSuccess: () => {
          setFiles([]);
          toast.success(t('dataSheet.sent'));
        },
        onError: (e) => toast.error(getErrorMessage(e)),
      },
    );

  return (
    <Card className={done ? undefined : 'border-primary/40 bg-primary/5'}>
      <CardHeader className="flex flex-row items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          {done ? <IconCircleCheck className="size-5 text-success" /> : <IconFileSpreadsheet className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-brand-navy">{t(done ? 'dataSheet.doneTitle' : 'dataSheet.title', { product: l(item.productName) })}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {done ? t('dataSheet.doneDesc', { names: sent.map((f) => f.originalName).join(', ') }) : t('dataSheet.desc')}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <FileUploader productId={item.product} accepted={ACCEPTED} files={files} onChange={setFiles} purpose="bulk" max={10} />
        <p className="rounded-lg bg-background px-3 py-2 text-xs text-muted-foreground">
          {t('dataSheet.useList')}{' '}
          <Link to="/institution/students" className="font-semibold text-primary hover:underline">
            {t('nav.students')}
          </Link>
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={downloadTemplate}>
            <IconDownload /> {t('dataSheet.template')}
          </Button>
          <Button variant="brand" disabled={files.length === 0 || add.isPending} onClick={send}>
            {add.isPending ? <Spinner className="size-4 text-current" /> : <IconSend />} {t(done ? 'dataSheet.sendMore' : 'dataSheet.send')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
