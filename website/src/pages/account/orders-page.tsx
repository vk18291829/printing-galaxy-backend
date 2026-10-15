import { useTranslation } from 'react-i18next';
import { OrderList } from '@/features/orders/components/order-list';
import { useDocumentTitle } from '@/hooks/use-document-title';

export default function OrdersPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('orders.title'));
  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="mb-6 text-3xl font-bold">{t('orders.title')}</h1>
      <OrderList />
    </div>
  );
}
