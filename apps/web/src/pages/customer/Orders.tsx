import { ACTIVE_ORDER_STATUSES } from '@dm/shared';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Package } from 'lucide-react';
import { Link } from 'react-router';
import {
  Button,
  EmptyState,
  ErrorBox,
  Money,
  PageHeader,
  SkeletonList,
  StatusBadge,
} from '../../components/ui';
import { get } from '../../lib/api';
import { dateTime, orderNo } from '../../lib/format';
import type { Order } from '../../lib/types';

export default function Orders() {
  const orders = useQuery({ queryKey: ['orders', 'mine'], queryFn: () => get<Order[]>('/orders') });
  const active = orders.data?.filter((o) => ACTIVE_ORDER_STATUSES.includes(o.status)) ?? [];
  const past = orders.data?.filter((o) => !ACTIVE_ORDER_STATUSES.includes(o.status)) ?? [];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="طلباتي" />
      {orders.isPending && <SkeletonList count={4} className="h-20 rounded-3xl" />}
      {orders.error && <ErrorBox error={orders.error} />}
      {orders.data?.length === 0 && (
        <EmptyState
          icon={Package}
          art="takeout"
          title="لسه ماطلبتش حاجة"
          text="أول طلب ليك هيظهر هنا وتقدر تتابعه لحظة بلحظة"
          action={
            <Link to="/">
              <Button>اطلب دلوقتي</Button>
            </Link>
          }
        />
      )}
      {active.length > 0 && <OrderGroup title="شغالة دلوقتي" orders={active} highlight />}
      {past.length > 0 && <OrderGroup title="طلبات قديمة" orders={past} />}
    </div>
  );
}

function OrderGroup({
  title,
  orders,
  highlight,
}: {
  title: string;
  orders: Order[];
  highlight?: boolean;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-sm font-bold text-ink-500">{title}</h2>
      <div className="space-y-3">
        {orders.map((o) => (
          <Link
            key={o.id}
            to={`/orders/${o.id}`}
            className={`flex items-center gap-4 rounded-3xl bg-white p-4 shadow-card ring-1 transition hover:shadow-lift ${highlight ? 'ring-brand-200' : 'ring-ink-200/60'}`}
          >
            <div
              className={`flex size-14 shrink-0 items-center justify-center rounded-2xl ${highlight ? 'bg-brand-50' : 'bg-[#efe9dd]'}`}
            >
              <img
                src={highlight ? '/art/courier.webp' : '/art/takeout.webp'}
                alt=""
                className="size-10"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-bold">{o.storeName}</span>
                <StatusBadge status={o.status} />
              </div>
              <div className="mt-1 flex items-center justify-between text-sm text-ink-500">
                <span className="tabular">
                  {orderNo(o.number)} · {dateTime(o.placedAt)}
                </span>
                <Money value={o.total} className="font-semibold text-ink-800" />
              </div>
            </div>
            <ChevronLeft className="size-5 shrink-0 text-ink-300" />
          </Link>
        ))}
      </div>
    </section>
  );
}
