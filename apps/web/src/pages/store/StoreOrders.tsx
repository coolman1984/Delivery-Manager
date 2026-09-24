import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, ErrorBox, Loading, StatusBadge } from '../../components/ui';
import { useToast } from '../../components/toast';
import { get, post } from '../../lib/api';
import { minutesSince, money, time } from '../../lib/format';
import type { Order, OrderDetail } from '../../lib/types';

export default function StoreOrders() {
  const orders = useQuery({
    queryKey: ['orders', 'store'],
    queryFn: () => get<Order[]>('/orders?status=placed,accepted,ready'),
    refetchInterval: 30_000,
  });
  if (orders.isPending) return <Loading />;
  if (orders.error) return <ErrorBox error={orders.error} />;
  if (orders.data.length === 0) return <Empty icon="☕" text="مفيش طلبات جديدة دلوقتي" />;

  const sections = [
    { status: 'placed', title: '🔔 طلبات جديدة' },
    { status: 'accepted', title: '👨‍🍳 بتتحضّر' },
    { status: 'ready', title: '📦 جاهزة ومستنية الطيار' },
  ] as const;

  return (
    <div className="space-y-6">
      {sections.map(({ status, title }) => {
        const list = orders.data.filter((o) => o.status === status);
        if (list.length === 0) return null;
        return (
          <section key={status}>
            <h2 className="mb-2 font-bold">
              {title} ({list.length})
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((o) => (
                <StoreOrderCard key={o.id} order={o} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function StoreOrderCard({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const detail = useQuery({
    queryKey: ['order', order.id],
    queryFn: () => get<OrderDetail>(`/orders/${order.id}`),
  });
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) =>
      post(`/orders/${order.id}/${path}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
    onError: (err) => toast(err.message, 'error'),
  });

  function reject() {
    const reason = prompt('سبب الرفض؟ (مثلاً: منتج خلص)');
    if (reason && reason.trim().length >= 3)
      action.mutate({ path: 'reject', body: { reason: reason.trim() } });
  }

  const waiting = minutesSince(order.placedAt);
  return (
    <Card className={order.status === 'placed' ? 'ring-2 ring-amber-300' : ''}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold">#{order.number}</span>
        <StatusBadge status={order.status} />
      </div>
      <div className="mb-2 text-xs text-slate-500">
        {time(order.placedAt)} · من {waiting} دقيقة {order.driverName && `· 🛵 ${order.driverName}`}
      </div>
      <ul className="tabular mb-2 space-y-0.5 text-sm">
        {detail.data?.items.map((it, i) => (
          <li key={i}>
            • {it.quantity} × {it.name}
          </li>
        ))}
      </ul>
      {order.note && <p className="mb-2 rounded-lg bg-slate-50 p-2 text-sm">📝 {order.note}</p>}
      <div className="tabular mb-3 text-sm text-slate-600">
        قيمة المنتجات: <b>{money(order.subtotal)}</b>
        {order.commissionAmount !== null && <> · العمولة: {money(order.commissionAmount)}</>}
      </div>
      <div className="flex gap-2">
        {order.status === 'placed' && (
          <>
            <Button
              className="flex-1"
              loading={action.isPending}
              onClick={() => action.mutate({ path: 'accept' })}
            >
              قبول
            </Button>
            <Button variant="secondary" onClick={reject} disabled={action.isPending}>
              رفض
            </Button>
          </>
        )}
        {order.status === 'accepted' && (
          <Button
            className="flex-1"
            loading={action.isPending}
            onClick={() => action.mutate({ path: 'ready' })}
          >
            الطلب جاهز ✅
          </Button>
        )}
      </div>
    </Card>
  );
}
