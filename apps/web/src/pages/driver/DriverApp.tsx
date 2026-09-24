import { DRIVER_STATUS_LABELS, type DriverStatus } from '@dm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Layout } from '../../components/Layout';
import { useToast } from '../../components/toast';
import { Button, Card, Empty, ErrorBox, Loading, StatusBadge } from '../../components/ui';
import { get, post } from '../../lib/api';
import { money, time, toPiasters } from '../../lib/format';
import type { OrderDetail, Order } from '../../lib/types';

interface DriverMe {
  status: DriverStatus;
  cash: { balance: number; todayDelivered: number; todayCollected: number };
}

export default function DriverApp() {
  return (
    <Layout title="الطيار" nav={[{ to: '/driver', label: 'طلباتي', icon: '🛵' }]}>
      <DriverHome />
    </Layout>
  );
}

function DriverHome() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useQuery({
    queryKey: ['driver-me'],
    queryFn: () => get<DriverMe>('/driver/me'),
    refetchInterval: 60_000,
  });
  const orders = useQuery({
    queryKey: ['orders', 'driver'],
    queryFn: () => get<Order[]>('/orders?status=accepted,ready,picked_up,placed'),
    refetchInterval: 30_000,
  });
  const setStatus = useMutation({
    mutationFn: (status: 'available' | 'offline') => post('/driver/status', { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['driver-me'] }),
    onError: (err) => toast(err.message, 'error'),
  });
  useShareLocation(me.data?.status !== undefined && me.data.status !== 'offline');

  if (me.isPending) return <Loading />;
  if (me.error) return <ErrorBox error={me.error} />;
  const online = me.data.status !== 'offline';

  return (
    <div className="space-y-4">
      <button
        onClick={() => setStatus.mutate(online ? 'offline' : 'available')}
        disabled={setStatus.isPending}
        className={`w-full rounded-2xl p-5 text-lg font-bold text-white shadow ${online ? 'bg-emerald-600' : 'bg-slate-500'}`}
      >
        {online ? `🟢 ${DRIVER_STATUS_LABELS[me.data.status]}` : '⚪ مش شغال'}
        <div className="text-sm font-normal opacity-90">
          {online ? 'اضغط عشان تقفل' : 'اضغط عشان تبدأ تستقبل طلبات'}
        </div>
      </button>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Card className="p-3">
          <div className="text-xs text-slate-500">العهدة معاك</div>
          <div className="tabular font-bold text-amber-700">{money(me.data.cash.balance)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500">حصّلت النهارده</div>
          <div className="tabular font-bold">{money(me.data.cash.todayCollected)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500">وصّلت النهارده</div>
          <div className="tabular font-bold">{me.data.cash.todayDelivered}</div>
        </Card>
      </div>

      <h2 className="font-bold">الطلبات المسندة ليك</h2>
      {orders.isPending && <Loading />}
      {orders.error && <ErrorBox error={orders.error} />}
      {orders.data?.length === 0 && <Empty icon="🛵" text="مفيش طلبات دلوقتي" />}
      {orders.data?.map((o) => (
        <DriverOrderCard key={o.id} order={o} />
      ))}
    </div>
  );
}

function DriverOrderCard({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const detail = useQuery({
    queryKey: ['order', order.id],
    queryFn: () => get<OrderDetail>(`/orders/${order.id}`),
  });
  const [collecting, setCollecting] = useState(false);
  const [amount, setAmount] = useState(String(order.total / 100));
  const done = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['driver-me'] });
  };
  const pickup = useMutation({
    mutationFn: () => post(`/orders/${order.id}/pickup`),
    onSuccess: done,
    onError: (e) => toast(e.message, 'error'),
  });
  const deliver = useMutation({
    mutationFn: (body: { cashCollected: number; note?: string }) =>
      post(`/orders/${order.id}/deliver`, body),
    onSuccess: () => {
      toast('تم التسليم ✅');
      done();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  function confirmDelivery() {
    const cash = toPiasters(amount);
    if (!Number.isInteger(cash)) return toast('المبلغ غلط', 'error');
    if (cash > order.total) return toast('المبلغ أكبر من المطلوب', 'error');
    let note: string | undefined;
    if (cash < order.total) {
      note = prompt(`حصّلت أقل من المطلوب بـ ${money(order.total - cash)}. اكتب السبب:`)?.trim();
      if (!note || note.length < 3) return;
    }
    deliver.mutate({ cashCollected: cash, ...(note ? { note } : {}) });
  }

  const d = detail.data;
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-bold">
          #{order.number} · {order.storeName}
        </span>
        <StatusBadge status={order.status} />
      </div>
      <div className="space-y-1 text-sm">
        <div>
          🏪 استلام من: <b>{order.storeName}</b>{' '}
          {d?.storePhone && (
            <a className="text-brand-700" href={`tel:${d.storePhone}`}>
              ({d.storePhone})
            </a>
          )}
        </div>
        <div>
          📍 توصيل لـ: <b>{order.customerName}</b> — {order.addressText}
        </div>
        {order.customerPhone && (
          <a
            className="inline-block rounded-lg bg-brand-50 px-3 py-1 font-semibold text-brand-700"
            href={`tel:${order.customerPhone}`}
          >
            📞 اتصل بالعميل
          </a>
        )}
        <div className="text-xs text-slate-500">اتطلب الساعة {time(order.placedAt)}</div>
      </div>
      <div className="tabular rounded-xl bg-amber-50 p-3 text-center">
        المطلوب تحصيله: <b className="text-lg">{money(order.total)}</b>
      </div>
      {order.status === 'ready' && (
        <Button className="w-full" loading={pickup.isPending} onClick={() => pickup.mutate()}>
          استلمت الطلب من المحل
        </Button>
      )}
      {(order.status === 'placed' || order.status === 'accepted') && (
        <p className="text-center text-sm text-slate-500">⏳ المحل لسه بيجهّز الطلب</p>
      )}
      {order.status === 'picked_up' && !collecting && (
        <Button className="w-full" onClick={() => setCollecting(true)}>
          سلّمت الطلب
        </Button>
      )}
      {collecting && (
        <div className="space-y-2">
          <label className="block text-sm font-medium">المبلغ اللي حصّلته بالجنيه</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            className="tabular min-h-12 w-full rounded-xl border border-slate-300 px-3 text-center text-xl font-bold"
          />
          <div className="flex gap-2">
            <Button className="flex-1" loading={deliver.isPending} onClick={confirmDelivery}>
              تأكيد التسليم
            </Button>
            <Button variant="secondary" onClick={() => setCollecting(false)}>
              رجوع
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** مشاركة مكان الطيار كل نص دقيقة وهو شغال (هيظهر على الخريطة في المرحلة الجاية) */
function useShareLocation(enabled: boolean) {
  const last = useRef(0);
  useEffect(() => {
    if (!enabled || !('geolocation' in navigator)) return;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() - last.current < 30_000) return;
        last.current = Date.now();
        void post('/driver/location', {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }).catch(() => undefined);
      },
      () => undefined,
      { enableHighAccuracy: false, maximumAge: 30_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);
}
