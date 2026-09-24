import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Route, Routes } from 'react-router';
import { Layout } from '../../components/Layout';
import { get, patch } from '../../lib/api';
import StoreOrders from './StoreOrders';
import StoreProducts from './StoreProducts';

interface StoreMe {
  id: string;
  name: string;
  isOpen: boolean;
}

export default function StoreApp() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['store-me'], queryFn: () => get<StoreMe>('/store/me') });
  const toggle = useMutation({
    mutationFn: (isOpen: boolean) => patch('/store/me/open', { isOpen }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['store-me'] }),
  });

  return (
    <Layout
      title={me.data?.name ?? 'لوحة المحل'}
      nav={[
        { to: '/store', label: 'الطلبات', icon: '📥' },
        { to: '/store/products', label: 'المنتجات', icon: '🏷️' },
      ]}
    >
      {me.data && (
        <button
          onClick={() => toggle.mutate(!me.data.isOpen)}
          disabled={toggle.isPending}
          className={`mb-4 flex w-full items-center justify-between rounded-2xl p-4 font-semibold ${me.data.isOpen ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-1 ring-slate-300'}`}
        >
          <span>{me.data.isOpen ? '🟢 المحل مفتوح وبيستقبل طلبات' : '⚪ المحل مقفول'}</span>
          <span className="text-sm underline">{me.data.isOpen ? 'اقفل' : 'افتح'}</span>
        </button>
      )}
      <Routes>
        <Route index element={<StoreOrders />} />
        <Route path="products" element={<StoreProducts />} />
        <Route path="*" element={<Navigate to="/store" replace />} />
      </Routes>
    </Layout>
  );
}
