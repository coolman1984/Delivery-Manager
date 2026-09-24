import { ACTIVE_ORDER_STATUSES, isAssignable, type OrderStatus } from '@dm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Bike,
  ChefHat,
  CircleX,
  Clock,
  MapPin,
  PackageCheck,
  Phone,
  Search,
  ShoppingBag,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useDialog } from '../../components/dialog';
import { useToast } from '../../components/toast';
import {
  Badge,
  Card,
  cx,
  EmptyState,
  ErrorBox,
  Input,
  Kpi,
  Money,
  PageHeader,
  Segmented,
  SkeletonList,
  StatusBadge,
} from '../../components/ui';
import { get, post } from '../../lib/api';
import { minutesSince, money, num, orderNo, time, todayCairo } from '../../lib/format';
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
const COLUMNS: Array<{ status: OrderStatus; title: string; icon: typeof Bell; tone: string }> = [
  { status: 'placed', title: 'مستني المحل', icon: Bell, tone: 'bg-amber-50 text-amber-600' },
  { status: 'accepted', title: 'بيتحضّر', icon: ChefHat, tone: 'bg-sky-50 text-sky-600' },
  { status: 'ready', title: 'جاهز', icon: PackageCheck, tone: 'bg-violet-50 text-violet-600' },
  { status: 'picked_up', title: 'في الطريق', icon: Bike, tone: 'bg-brand-50 text-brand-600' },
];

export default function Board() {
  const [view, setView] = useState<'active' | 'today'>('active');
  const [search, setSearch] = useState('');
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
          : `/orders?date=${todayCairo()}`,
      ),
    refetchInterval: 30_000,
  });
  const drivers = useQuery({
    queryKey: ['finance', 'drivers'],
    queryFn: () => get<DriverOverview[]>('/ops/finance/drivers'),
  });

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return orders.data ?? [];
    return (orders.data ?? []).filter(
      (o) =>
        String(o.number) === q ||
        o.customerName.includes(q) ||
        o.storeName?.includes(q) ||
        o.customerPhone?.includes(q),
    );
  }, [orders.data, search]);

  const s = summary.data;
  const total = s ? Object.values(s.ordersByStatus).reduce((a, b) => a + (b ?? 0), 0) : 0;
  const online = drivers.data?.filter((d) => d.status !== 'offline').length ?? 0;

  return (
    <div>
      <PageHeader
        title="لوحة التشغيل"
        subtitle="كل الطلبات لحظة بلحظة، والطلب المتأخر بيتعلّم بالأحمر"
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={ShoppingBag}
          tone="brand"
          label="طلبات النهارده"
          value={s ? num(total) : '—'}
          hint={s ? `${num(s.ordersByStatus.delivered ?? 0)} اتسلّم` : undefined}
        />
        <Kpi
          icon={TrendingUp}
          tone="success"
          label="أرباح النهارده"
          value={s ? money(s.commission + s.deliveryFees) : '—'}
          hint="عمولة + توصيل"
        />
        <Kpi
          icon={Wallet}
          tone="warning"
          label="فلوس مع الطيارين"
          value={s ? money(s.cashWithDrivers) : '—'}
          hint={`${num(online)} طيار شغال`}
        />
        <Kpi
          icon={TriangleAlert}
          tone={s?.lateOrders ? 'danger' : 'neutral'}
          label="طلبات متأخرة"
          value={s ? (s.lateOrders ? num(s.lateOrders) : 'مفيش') : '—'}
          hint="أكتر من ساعة"
        />
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'active', label: 'الشغالة دلوقتي' },
            { value: 'today', label: 'كل طلبات النهارده' },
          ]}
        />
        <div className="w-full sm:w-72">
          <Input
            icon={Search}
            placeholder="رقم الطلب أو اسم العميل"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="بحث في الطلبات"
          />
        </div>
      </div>

      {orders.isPending && <SkeletonList count={3} className="h-40 rounded-3xl" />}
      {orders.error && <ErrorBox error={orders.error} />}
      {orders.data && filtered.length === 0 && (
        <EmptyState
          icon={ShoppingBag}
          title="مفيش طلبات"
          text={search ? 'مفيش طلب بالبحث ده' : 'أول ما يوصل طلب هيظهر هنا'}
        />
      )}

      {view === 'active' && filtered.length > 0 ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((c) => {
            const list = filtered.filter((o) => o.status === c.status);
            return (
              <section key={c.status} className="min-w-0">
                <div className="mb-3 flex items-center gap-2">
                  <span
                    className={cx('flex size-8 items-center justify-center rounded-xl', c.tone)}
                  >
                    <c.icon className="size-4" />
                  </span>
                  <h2 className="font-bold">{c.title}</h2>
                  <span className="tabular rounded-full bg-ink-100 px-2 text-sm text-ink-600">
                    {num(list.length)}
                  </span>
                </div>
                <div className="space-y-3">
                  {list.map((o) => (
                    <OpsOrderCard key={o.id} order={o} drivers={drivers.data ?? []} />
                  ))}
                  {list.length === 0 && (
                    <div className="rounded-3xl border-2 border-dashed border-ink-200 py-8 text-center text-sm text-ink-400">
                      فاضي
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((o) => (
            <OpsOrderCard key={o.id} order={o} drivers={drivers.data ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}

function OpsOrderCard({ order, drivers }: { order: Order; drivers: DriverOverview[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['orders'] });
    void queryClient.invalidateQueries({ queryKey: ['finance'] });
  };
  const assign = useMutation({
    mutationFn: (driverId: string) => post(`/orders/${order.id}/assign`, { driverId }),
    onSuccess: () => {
      toast('اتسند للطيار');
      refresh();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => post(`/orders/${order.id}/cancel-by-ops`, { reason }),
    onSuccess: () => {
      toast('الطلب اتلغى');
      refresh();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const age = minutesSince(order.placedAt);
  const active = ACTIVE_ORDER_STATUSES.includes(order.status);
  const late = active && age >= LATE_MINUTES;
  const available = drivers.filter((d) => d.isActive && d.status !== 'offline');

  async function askCancel() {
    const reason = await dialog.prompt({
      title: `إلغاء طلب ${orderNo(order.number)}`,
      description: 'السبب هيتسجل في سجل العمليات وهيظهر للعميل',
      label: 'سبب الإلغاء',
      suggestions: ['العميل طلب الإلغاء', 'مفيش طيارين متاحين', 'العميل مابيردش'],
      minLength: 3,
      confirmLabel: 'إلغاء الطلب',
      danger: true,
      icon: CircleX,
    });
    if (reason) cancel.mutate(reason);
  }

  return (
    <Card padded={false} className={cx('overflow-hidden', late && 'ring-2 ring-rose-300')}>
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <div className="tabular text-xs text-ink-500">{orderNo(order.number)}</div>
          <div className="truncate font-bold">{order.storeName}</div>
        </div>
        {active ? (
          <Badge tone={late ? 'danger' : 'neutral'}>
            <Clock className="size-3.5" /> {num(age)} د
          </Badge>
        ) : (
          <StatusBadge status={order.status} />
        )}
      </div>
      <div className="space-y-1.5 px-4 py-3 text-sm text-ink-600">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium text-ink-800">{order.customerName}</span>
          {order.customerPhone && (
            <a
              href={`tel:${order.customerPhone}`}
              className="flex items-center gap-1 text-brand-700"
              dir="ltr"
            >
              <Phone className="size-3.5" /> {order.customerPhone}
            </a>
          )}
        </div>
        <div className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 size-3.5 shrink-0" />
          <span className="line-clamp-2">{order.addressText}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="tabular">{time(order.placedAt)}</span>
          <Money value={order.total} className="font-bold text-ink-900" />
        </div>
        {order.reason && (
          <div className="rounded-xl bg-rose-50 px-2.5 py-1.5 text-rose-700">{order.reason}</div>
        )}
        {order.cashDiffStatus === 'pending' && <Badge tone="warning">فرق تحصيل مستني قرار</Badge>}
      </div>

      {isAssignable(order.status) ? (
        <div className="flex items-center gap-2 border-t border-ink-100 bg-ink-50 px-4 py-3">
          <Bike className="size-4 shrink-0 text-ink-500" />
          <select
            aria-label="اختيار الطيار"
            className={cx(
              'h-10 min-w-0 flex-1 cursor-pointer rounded-xl border-0 bg-white px-3 text-sm ring-1 ring-inset focus:ring-2 focus:ring-brand-500',
              order.driverId ? 'ring-ink-200' : 'font-semibold text-brand-700 ring-brand-300',
            )}
            value={order.driverId ?? ''}
            disabled={assign.isPending}
            onChange={(e) => e.target.value && assign.mutate(e.target.value)}
          >
            <option value="">{available.length ? 'اختار طيار' : 'مفيش طيارين متاحين'}</option>
            {available.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.status === 'available' ? 'فاضي' : `معاه ${num(d.activeOrders)}`})
              </option>
            ))}
          </select>
          {active && (
            <button
              onClick={() => void askCancel()}
              className="cursor-pointer rounded-xl p-2 text-ink-400 hover:bg-rose-50 hover:text-rose-600"
              aria-label="إلغاء الطلب"
            >
              <CircleX className="size-5" />
            </button>
          )}
        </div>
      ) : (
        (order.driverName || active) && (
          <div className="flex items-center justify-between gap-2 border-t border-ink-100 bg-ink-50 px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <Bike className="size-4 text-brand-600" /> {order.driverName ?? '—'}
            </span>
            {active && (
              <button
                onClick={() => void askCancel()}
                className="cursor-pointer text-xs text-ink-400 hover:text-rose-600"
              >
                إلغاء
              </button>
            )}
          </div>
        )
      )}
    </Card>
  );
}
