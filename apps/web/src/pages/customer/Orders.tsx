import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Empty, ErrorBox, Loading, PageTitle, StatusBadge } from '../../components/ui';
import { get } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import type { Order } from '../../lib/types';

export default function Orders() {
  const orders = useQuery({ queryKey: ['orders', 'mine'], queryFn: () => get<Order[]>('/orders') });
  return (
    <div>
      <PageTitle>طلباتي</PageTitle>
      {orders.isPending && <Loading />}
      {orders.error && <ErrorBox error={orders.error} />}
      {orders.data?.length === 0 && <Empty icon="📦" text="لسه ماطلبتش حاجة" />}
      <div className="space-y-2">
        {orders.data?.map((o) => (
          <Link
            key={o.id}
            to={`/orders/${o.id}`}
            className="block rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{o.storeName}</span>
              <StatusBadge status={o.status} />
            </div>
            <div className="tabular mt-1 flex justify-between text-sm text-slate-500">
              <span>
                #{o.number} · {dateTime(o.placedAt)}
              </span>
              <span>{money(o.total)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
