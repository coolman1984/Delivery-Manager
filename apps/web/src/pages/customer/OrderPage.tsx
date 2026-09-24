import { ORDER_STATUS_LABELS, type OrderStatus } from '@dm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useParams } from 'react-router';
import { Button, Card, ErrorBox, Loading, StatusBadge } from '../../components/ui';
import { get, post } from '../../lib/api';
import { money, time } from '../../lib/format';
import type { OrderDetail } from '../../lib/types';

const STEPS: OrderStatus[] = ['placed', 'accepted', 'ready', 'picked_up', 'delivered'];

export default function OrderPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => get<OrderDetail>(`/orders/${id}`),
    // احتياطي لو الإشعارات اللحظية فصلت
    refetchInterval: (q) =>
      q.state.data && ['delivered', 'rejected', 'cancelled'].includes(q.state.data.status)
        ? false
        : 30_000,
  });
  const cancel = useMutation({
    mutationFn: () => post(`/orders/${id}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', id] }),
  });

  if (order.isPending) return <Loading />;
  if (order.error) return <ErrorBox error={order.error} />;
  const o = order.data;
  const current = STEPS.indexOf(o.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">طلب #{o.number}</h1>
        <StatusBadge status={o.status} />
      </div>

      {current >= 0 ? (
        <Card>
          <ol className="space-y-3">
            {STEPS.map((s, i) => {
              const at = o.events.find((e) => e.toStatus === s)?.createdAt ?? null;
              return (
                <li key={s} className="flex items-center gap-3">
                  <span
                    className={`flex size-7 items-center justify-center rounded-full text-sm font-bold ${i <= current ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'}`}
                  >
                    {i < current ? '✓' : i + 1}
                  </span>
                  <span className={`flex-1 ${i <= current ? 'font-semibold' : 'text-slate-400'}`}>
                    {ORDER_STATUS_LABELS[s]}
                  </span>
                  <span className="tabular text-xs text-slate-500">{at ? time(at) : ''}</span>
                </li>
              );
            })}
          </ol>
        </Card>
      ) : (
        <Card className="bg-red-50 text-red-800">
          {ORDER_STATUS_LABELS[o.status]}
          {o.reason ? `: ${o.reason}` : ''}
        </Card>
      )}

      {o.driverName && (
        <Card className="flex items-center justify-between">
          <span>
            🛵 الطيار: <b>{o.driverName}</b>
          </span>
          {o.driverPhone && o.status === 'picked_up' && (
            <a
              href={`tel:${o.driverPhone}`}
              className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700"
            >
              اتصل
            </a>
          )}
        </Card>
      )}

      <Card className="tabular space-y-1 text-sm">
        <div className="mb-2 font-semibold">{o.storeName}</div>
        {o.items.map((it, i) => (
          <div key={i} className="flex justify-between">
            <span>
              {it.quantity} × {it.name}
            </span>
            <span>{money(it.lineTotal)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-slate-100 pt-2">
          <span>التوصيل</span>
          <span>{money(o.deliveryFee)}</span>
        </div>
        <div className="flex justify-between text-base font-bold">
          <span>الإجمالي (كاش)</span>
          <span>{money(o.total)}</span>
        </div>
        <div className="pt-1 text-xs text-slate-500">📍 {o.addressText}</div>
      </Card>

      {o.status === 'placed' && (
        <Button
          variant="danger"
          className="w-full"
          loading={cancel.isPending}
          onClick={() => confirm('متأكد إنك عايز تلغي الطلب؟') && cancel.mutate()}
        >
          إلغاء الطلب
        </Button>
      )}
      {cancel.error && <ErrorBox error={cancel.error} />}
      {o.status === 'delivered' && !o.rated && (
        <RateForm orderId={o.id} hasDriver={Boolean(o.driverId)} />
      )}
      {o.rated && <p className="text-center text-sm text-slate-500">⭐ شكراً على تقييمك</p>}
    </div>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" dir="ltr">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`text-3xl ${n <= value ? '' : 'opacity-25 grayscale'}`}
          aria-label={`${n} نجوم`}
        >
          ⭐
        </button>
      ))}
    </div>
  );
}

function RateForm({ orderId, hasDriver }: { orderId: string; hasDriver: boolean }) {
  const [store, setStore] = useState(5);
  const [driver, setDriver] = useState(5);
  const queryClient = useQueryClient();
  const rate = useMutation({
    mutationFn: () =>
      post(`/orders/${orderId}/rate`, {
        storeRating: store,
        ...(hasDriver ? { driverRating: driver } : {}),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', orderId] }),
  });
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">قيّم تجربتك</h2>
      <div className="flex items-center justify-between">
        <span>المحل</span>
        <Stars value={store} onChange={setStore} />
      </div>
      {hasDriver && (
        <div className="flex items-center justify-between">
          <span>الطيار</span>
          <Stars value={driver} onChange={setDriver} />
        </div>
      )}
      {rate.error && <ErrorBox error={rate.error} />}
      <Button className="w-full" loading={rate.isPending} onClick={() => rate.mutate()}>
        إرسال التقييم
      </Button>
    </Card>
  );
}
