import { IconPackage } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { PageBanner } from '@/components/common/page-banner';
import { OrderList } from '@/features/orders/components/order-list';
import { useDocumentTitle } from '@/hooks/use-document-title';

export default function OrdersPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('orders.title'));
  return (
    <div className="container-page max-w-5xl space-y-6 py-8 sm:py-10">
      <PageBanner icon={<IconPackage />} title={t('orders.title')} description={t('orders.subtitle')} />
      <OrderList />
    </div>
  );
}
