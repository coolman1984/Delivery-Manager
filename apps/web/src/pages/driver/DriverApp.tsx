import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Bike,
  CircleCheck,
  Hourglass,
  MapPin,
  Navigation,
  Phone,
  Store,
  User,
  Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Modal } from '../../components/dialog';
import { StaffShell } from '../../components/Shell';
import { useToast } from '../../components/toast';
import {
  Button,
  Card,
  cx,
  EmptyState,
  ErrorBox,
  Input,
  Money,
  PageHeader,
  SkeletonList,
  StatusBadge,
  Switch,
} from '../../components/ui';
import { get, post } from '../../lib/api';
import { money, num, orderNo, time, toPiasters } from '../../lib/format';
import type { Order, OrderDetail } from '../../lib/types';

interface DriverMe {
  status: 'offline' | 'available' | 'busy';
  cash: { balance: number; todayDelivered: number; todayCollected: number };
}

const useDriverMe = () =>
  useQuery({
    queryKey: ['driver-me'],
    queryFn: () => get<DriverMe>('/driver/me'),
    refetchInterval: 60_000,
  });

export default function DriverApp() {
  const orders = useQuery({
    queryKey: ['orders', 'driver'],
    queryFn: () => get<Order[]>('/orders?status=placed,accepted,ready,picked_up'),
    refetchInterval: 30_000,
  });
  return (
    <StaffShell
      nav={[
        { to: '/driver', label: 'طلباتي', icon: Bike, badge: orders.data?.length },
        { to: '/driver/wallet', label: 'العهدة', icon: Wallet },
      ]}
    >
      <Routes>
        <Route index element={<DriverHome />} />
        <Route path="wallet" element={<DriverWallet />} />
        <Route path="*" element={<Navigate to="/driver" replace />} />
      </Routes>
    </StaffShell>
  );
}

function DriverHome() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const me = useDriverMe();
  const orders = useQuery({
    queryKey: ['orders', 'driver'],
    queryFn: () => get<Order[]>('/orders?status=placed,accepted,ready,picked_up'),
    refetchInterval: 30_000,
  });
  const setStatus = useMutation({
    mutationFn: (status: 'available' | 'offline') => post('/driver/status', { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['driver-me'] }),
    onError: (err) => toast(err.message, 'error'),
  });
  useShareLocation(me.data !== undefined && me.data.status !== 'offline');

  if (me.isPending) return <SkeletonList count={3} className="h-32 rounded-3xl" />;
  if (me.error) return <ErrorBox error={me.error} />;
  const online = me.data.status !== 'offline';

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div
        className={cx(
          'flex items-center gap-4 rounded-3xl p-5 text-white shadow-lift transition-colors',
          online ? 'bg-gradient-to-br from-emerald-600 to-teal-500' : 'bg-ink-800',
        )}
      >
        <span
          className={cx(
            'relative flex size-12 items-center justify-center rounded-2xl',
            online ? 'bg-white/20' : 'bg-white/10',
          )}
        >
          <Bike className="size-6" />
          {online && (
            <span className="absolute -top-1 -end-1 size-3 animate-pulse rounded-full bg-white ring-2 ring-emerald-600" />
          )}
        </span>
        <div className="flex-1">
          <div className="text-lg font-bold">
            {me.data.status === 'busy' ? 'في مشوار' : online ? 'متاح للطلبات' : 'مش شغال'}
          </div>
          <div className="text-sm text-white/75">
            {online ? 'مدير التشغيل يقدر يبعتلك طلبات' : 'شغّل عشان تبدأ تستقبل طلبات'}
          </div>
        </div>
        <Switch
          size="lg"
          checked={online}
          disabled={setStatus.isPending}
          onChange={(v) => setStatus.mutate(v ? 'available' : 'offline')}
          label="متاح للطلبات"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-xs text-ink-500">العهدة معاك</div>
          <Money
            value={me.data.cash.balance}
            className="mt-1 block text-xl font-bold text-brand-700"
          />
        </Card>
        <Card className="p-4">
          <div className="text-xs text-ink-500">وصّلت النهارده</div>
          <div className="tabular mt-1 text-xl font-bold">
            {num(me.data.cash.todayDelivered)} طلب
          </div>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 font-bold">الطلبات المسندة ليك</h2>
        {orders.isPending && <SkeletonList count={2} className="h-56 rounded-3xl" />}
        {orders.error && <ErrorBox error={orders.error} />}
        {orders.data?.length === 0 && (
          <Card>
            <EmptyState
              icon={Bike}
              title="مفيش طلبات دلوقتي"
              text="أول ما مدير التشغيل يسند لك طلب هتسمع تنبيه"
            />
          </Card>
        )}
        <div className="space-y-4">
          {orders.data?.map((o) => (
            <DriverOrderCard key={o.id} order={o} />
          ))}
        </div>
      </section>
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
  const [delivering, setDelivering] = useState(false);
  const pickup = useMutation({
    mutationFn: () => post(`/orders/${order.id}/pickup`),
    onSuccess: () => {
      toast('استلمت الطلب، يلا على العميل');
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const pickedUp = order.status === 'picked_up';
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.addressText)}`;

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-100 px-5 py-3.5">
        <span className="tabular font-bold">{orderNo(order.number)}</span>
        <StatusBadge status={order.status} />
      </div>

      <div className="px-5 py-4">
        <ol className="relative space-y-5">
          <div className="absolute top-6 bottom-6 start-[19px] w-0.5 bg-ink-200" />
          <Stop
            done={pickedUp}
            icon={Store}
            title="استلام من"
            name={order.storeName ?? ''}
            phone={detail.data?.storePhone}
          />
          <Stop
            done={false}
            active={pickedUp}
            icon={User}
            title="توصيل لـ"
            name={order.customerName}
            phone={order.customerPhone}
            extra={
              <div className="mt-1.5 space-y-2">
                <p className="flex items-start gap-1.5 text-sm text-ink-600">
                  <MapPin className="mt-0.5 size-4 shrink-0" /> {order.addressText}
                </p>
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"
                >
                  <Navigation className="size-4" /> افتح في الخريطة
                </a>
              </div>
            }
          />
        </ol>
      </div>

      <div className="mx-5 mb-4 flex items-center justify-between rounded-2xl bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
        <span className="flex items-center gap-2 text-sm font-medium text-amber-900">
          <Banknote className="size-5" /> حصّل من العميل
        </span>
        <Money value={order.total} className="text-xl font-bold text-amber-900" />
      </div>

      <div className="bg-ink-50 px-5 py-4">
        {order.status === 'ready' && (
          <Button size="lg" block loading={pickup.isPending} onClick={() => pickup.mutate()}>
            استلمت الطلب من المحل
          </Button>
        )}
        {(order.status === 'placed' || order.status === 'accepted') && (
          <p className="flex items-center justify-center gap-2 py-2 text-sm text-ink-500">
            <Hourglass className="size-4" /> المحل لسه بيجهّز الطلب · اتطلب {time(order.placedAt)}
          </p>
        )}
        {pickedUp && (
          <Button
            size="lg"
            variant="dark"
            icon={CircleCheck}
            block
            onClick={() => setDelivering(true)}
          >
            سلّمت الطلب
          </Button>
        )}
      </div>
      <DeliverModal order={order} open={delivering} onClose={() => setDelivering(false)} />
    </Card>
  );
}

function Stop({
  icon: Icon,
  title,
  name,
  phone,
  extra,
  done,
  active,
}: {
  icon: typeof Store;
  title: string;
  name: string;
  phone?: string | null;
  extra?: React.ReactNode;
  done: boolean;
  active?: boolean;
}) {
  return (
    <li className="relative flex gap-3">
      <span
        className={cx(
          'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-2xl',
          done
            ? 'bg-emerald-500 text-white'
            : active
              ? 'bg-brand-600 text-white'
              : 'bg-white text-ink-500 ring-1 ring-ink-200',
        )}
      >
        {done ? <CircleCheck className="size-5" /> : <Icon className="size-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-ink-500">{title}</div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold">{name}</span>
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
              aria-label={`اتصل بـ ${name}`}
            >
              <Phone className="size-4" />
            </a>
          )}
        </div>
        {extra}
      </div>
    </li>
  );
}

const SHORT_REASONS = ['العميل ماكانش معاه فكة', 'العميل رجّع صنف', 'خصم متفق عليه مع الإدارة'];

function DeliverModal({
  order,
  open,
  onClose,
}: {
  order: Order;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState(String(order.total / 100));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cash = toPiasters(amount);
  const short = Number.isInteger(cash) && cash < order.total;

  const deliver = useMutation({
    mutationFn: () =>
      post(`/orders/${order.id}/deliver`, {
        cashCollected: cash,
        ...(short ? { note: reason.trim() } : {}),
      }),
    onSuccess: () => {
      toast('تم التسليم، تسلم إيدك');
      onClose();
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['driver-me'] });
    },
    onError: (e) => setError(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!Number.isInteger(cash)) return setError('اكتب المبلغ صح');
    if (cash > order.total) return setError('المبلغ أكبر من المطلوب');
    if (short && reason.trim().length < 3) return setError('اكتب سبب الفرق');
    deliver.mutate();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`تسليم طلب ${orderNo(order.number)}`}
      description={`المطلوب: ${money(order.total)}`}
      icon={Banknote}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="المبلغ اللي استلمته"
          suffix="ج.م"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          dir="ltr"
          className="tabular h-14 text-center text-2xl font-bold"
        />
        <button
          type="button"
          onClick={() => setAmount(String(order.total / 100))}
          className="cursor-pointer rounded-full bg-emerald-50 px-3.5 py-1.5 text-sm font-medium text-emerald-700"
        >
          استلمت المبلغ كامل
        </button>
        {short && (
          <div className="space-y-3 rounded-2xl bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">
              ناقص {money(order.total - cash)}. اكتب السبب وهيتراجع من مدير التشغيل.
            </p>
            <div className="flex flex-wrap gap-2">
              {SHORT_REASONS.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setReason(r)}
                  className={cx(
                    'cursor-pointer rounded-full px-3 py-1 text-xs',
                    reason === r ? 'bg-ink-900 text-white' : 'bg-white text-ink-700',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            <Input label="السبب" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        {error && <ErrorBox error={new Error(error)} />}
        <Button type="submit" size="lg" block loading={deliver.isPending}>
          تأكيد التسليم
        </Button>
      </form>
    </Modal>
  );
}

function DriverWallet() {
  const me = useDriverMe();
  if (me.isPending) return <SkeletonList count={2} className="h-40 rounded-3xl" />;
  if (me.error) return <ErrorBox error={me.error} />;
  const c = me.data.cash;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader title="العهدة" subtitle="الفلوس اللي حصّلتها ولسه ماسلّمتهاش للشركة" />
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-amber-500 p-6 text-white shadow-lift">
        <Wallet className="absolute -bottom-6 -left-4 size-36 text-white/15" strokeWidth={1.4} />
        <div className="relative">
          <div className="text-sm text-white/80">معاك دلوقتي</div>
          <Money value={c.balance} className="mt-1 block text-4xl font-bold" />
          <p className="mt-3 text-sm text-white/85">
            سلّمها لمدير التشغيل آخر اليوم عشان تتقفل التسوية
          </p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-xs text-ink-500">حصّلت النهارده</div>
          <Money value={c.todayCollected} className="mt-1 block text-xl font-bold" />
        </Card>
        <Card>
          <div className="text-xs text-ink-500">طلبات النهارده</div>
          <div className="tabular mt-1 text-xl font-bold">{num(c.todayDelivered)}</div>
        </Card>
      </div>
    </div>
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
