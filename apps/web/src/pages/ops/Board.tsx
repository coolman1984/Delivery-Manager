import { ACTIVE_ORDER_STATUSES, isAssignable, type OrderStatus } from '@dm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '../../components/toast';
import { Card, Empty, ErrorBox, Loading, Stat, StatusBadge } from '../../components/ui';
import { get, post } from '../../lib/api';
import { minutesSince, money, time } from '../../lib/format';
import type { DriverOverview, Order } from '../../lib/types';

interface Summary {
  ordersByStatus: Partial<Record<OrderStatus, number>>;
  sales: number;
  commission: number;
  deliveryFees: number;
  cashWithDrivers: number;
  pendingCashDifferences: number;
  lateOrders: number;
}

const LATE_MINUTES = 45;

export default function Board() {
  const [view, setView] = useState<'active' | 'today'>('active');
  const summary = useQuery({
    queryKey: ['finance', 'summary'],
    queryFn: () => get<Summary>('/ops/finance/summary'),
    refetchInterval: 60_000,
  });
  const orders = useQuery({
    queryKey: ['orders', 'ops', view],
    queryFn: () =>
      get<Order[]>(
        view === 'active'
          ? `/orders?status=${ACTIVE_ORDER_STATUSES.join(',')}`
          : `/orders?date=${new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())}`,
      ),
    refetchInterval: 30_000,
  });
  const drivers = useQuery({
    queryKey: ['finance', 'drivers'],
    queryFn: () => get<DriverOverview[]>('/ops/finance/drivers'),
  });

  const s = summary.data;
  const delivered = s?.ordersByStatus.delivered ?? 0;
  const total = s ? Object.values(s.ordersByStatus).reduce((a, b) => a + (b ?? 0), 0) : 0;

  return (
    <div className="space-y-5">
      {s && (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="طلبات النهارده" value={`${delivered} / ${total}`} />
          <Stat
            label="أرباح النهارده (عمولة + توصيل)"
            value={money(s.commission + s.deliveryFees)}
          />
          <Stat
            label="فلوس مع الطيارين"
            value={money(s.cashWithDrivers)}
            tone={s.cashWithDrivers > 0 ? 'warn' : 'default'}
          />
          <Stat
            label="طلبات متأخرة (+ساعة)"
            value={s.lateOrders}
            tone={s.lateOrders > 0 ? 'warn' : 'default'}
          />
        </div>
      )}

      <div className="flex gap-2">
        {(['active', 'today'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-full px-4 py-1.5 text-sm ${view === v ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-slate-300'}`}
          >
            {v === 'active' ? 'الشغالة دلوقتي' : 'كل طلبات النهارده'}
          </button>
        ))}
      </div>

      {orders.isPending && <Loading />}
      {orders.error && <ErrorBox error={orders.error} />}
      {orders.data?.length === 0 && <Empty icon="✨" text="مفيش طلبات" />}
      <div className="grid gap-3 lg:grid-cols-2">
        {orders.data?.map((o) => (
          <OpsOrderCard key={o.id} order={o} drivers={drivers.data ?? []} />
        ))}
      </div>
    </div>
  );
}

function OpsOrderCard({ order, drivers }: { order: Order; drivers: DriverOverview[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['finance'] });
  };
  const assign = useMutation({
    mutationFn: (driverId: string) => post(`/orders/${order.id}/assign`, { driverId }),
    onSuccess: () => {
      toast('اتسند للطيار ✅');
      refresh();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => post(`/orders/${order.id}/cancel-by-ops`, { reason }),
    onSuccess: refresh,
    onError: (e) => toast(e.message, 'error'),
  });

  const age = minutesSince(order.placedAt);
  const active = ACTIVE_ORDER_STATUSES.includes(order.status);
  const late = active && age >= LATE_MINUTES;
  const available = drivers.filter((d) => d.isActive && d.status !== 'offline');

  return (
    <Card className={late ? 'ring-2 ring-red-300' : ''}>
      <div className="mb-1 flex items-center justify-between">
        <span className="font-bold">
          #{order.number} · {order.storeName}
        </span>
        <StatusBadge status={order.status} />
      </div>
      <div className="space-y-0.5 text-sm text-slate-600">
        <div>
          👤 {order.customerName}{' '}
          {order.customerPhone && (
            <a className="text-brand-700" href={`tel:${order.customerPhone}`}>
              {order.customerPhone}
            </a>
          )}
        </div>
        <div>📍 {order.addressText}</div>
        <div className="tabular">
          🕒 {time(order.placedAt)}{' '}
          {active && <span className={late ? 'font-bold text-red-600' : ''}>(من {age} دقيقة)</span>}{' '}
          · 💵 {money(order.total)}
        </div>
        {order.reason && <div className="text-red-700">السبب: {order.reason}</div>}
        {order.cashDiffStatus === 'pending' && (
          <div className="font-semibold text-amber-700">⚠️ فيه فرق تحصيل مستني قرار</div>
        )}
      </div>
      {isAssignable(order.status) && (
        <div className="mt-3 flex items-center gap-2">
          <select
            className="min-h-10 flex-1 rounded-xl border border-slate-300 bg-white px-2 text-sm"
            value={order.driverId ?? ''}
            disabled={assign.isPending}
            onChange={(e) => e.target.value && assign.mutate(e.target.value)}
          >
            <option value="">{available.length ? '🛵 اختار طيار' : 'مفيش طيارين متاحين'}</option>
            {available.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.status === 'available' ? 'متاح' : `معاه ${d.activeOrders} طلب`}
              </option>
            ))}
          </select>
        </div>
      )}
      {!isAssignable(order.status) && order.driverName && (
        <div className="mt-2 text-sm">🛵 {order.driverName}</div>
      )}
      {active && (
        <button
          className="mt-3 text-sm text-red-600 underline"
          onClick={() => {
            const reason = prompt('سبب الإلغاء؟');
            if (reason && reason.trim().length >= 3) cancel.mutate(reason.trim());
          }}
        >
          إلغاء الطلب
        </button>
      )}
    </Card>
  );
}
