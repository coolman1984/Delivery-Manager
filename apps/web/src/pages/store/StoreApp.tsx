import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Tag } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router';
import { StaffShell } from '../../components/Shell';
import { get } from '../../lib/api';
import type { Order } from '../../lib/types';
import StoreOrders from './StoreOrders';
import StoreProducts from './StoreProducts';

export default function StoreApp() {
  const orders = useQuery({
    queryKey: ['orders', 'store'],
    queryFn: () => get<Order[]>('/orders?status=placed,accepted,ready'),
    refetchInterval: 30_000,
  });
  const fresh = orders.data?.filter((o) => o.status === 'placed').length ?? 0;
  return (
    <StaffShell
      nav={[
        { to: '/store', label: 'الطلبات', icon: ClipboardList, badge: fresh },
        { to: '/store/products', label: 'المنتجات والأسعار', icon: Tag },
      ]}
    >
      <Routes>
        <Route index element={<StoreOrders />} />
        <Route path="products" element={<StoreProducts />} />
        <Route path="*" element={<Navigate to="/store" replace />} />
      </Routes>
    </StaffShell>
  );
}
