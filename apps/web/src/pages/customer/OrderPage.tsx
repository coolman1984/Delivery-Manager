import type { OrderStatus } from '@dm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bike,
  ChefHat,
  CircleCheck,
  CircleX,
  Hourglass,
  MapPin,
  PackageCheck,
  Phone,
  ScrollText,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useDialog } from '../../components/dialog';
import { useToast } from '../../components/toast';
import {
  Avatar,
  Button,
  Card,
  cx,
  ErrorBox,
  IconButton,
  Money,
  SectionTitle,
  Skeleton,
} from '../../components/ui';
import { get, post } from '../../lib/api';
import { num, orderNo, time } from '../../lib/format';
import type { OrderDetail } from '../../lib/types';

const STEPS: Array<{ status: OrderStatus; icon: LucideIcon; label: string }> = [
  { status: 'placed', icon: Hourglass, label: 'اتطلب' },
  { status: 'accepted', icon: ChefHat, label: 'بيتحضّر' },
  { status: 'ready', icon: PackageCheck, label: 'جاهز' },
  { status: 'picked_up', icon: Bike, label: 'في الطريق' },
  { status: 'delivered', icon: CircleCheck, label: 'وصل' },
];

const HERO_ART: Record<OrderStatus, string> = {
  placed: 'stopwatch',
  accepted: 'cook',
  ready: 'package',
  picked_up: 'courier',
  delivered: 'party',
  rejected: 'receipt',
  cancelled: 'receipt',
};

const HERO: Record<OrderStatus, { title: string; text: string; icon: LucideIcon; tone: string }> = {
  placed: {
    title: 'مستنيين المحل يأكد طلبك',
    text: 'عادةً بياخد دقيقة أو اتنين',
    icon: Hourglass,
    tone: 'from-brand-700 to-brand-500',
  },
  accepted: {
    title: 'طلبك بيتحضّر',
    text: 'المحل شغال عليه دلوقتي',
    icon: ChefHat,
    tone: 'from-brand-700 to-brand-500',
  },
  ready: {
    title: 'طلبك جاهز',
    text: 'الطيار في طريقه يستلمه',
    icon: PackageCheck,
    tone: 'from-brand-700 to-brand-500',
  },
  picked_up: {
    title: 'الطيار في الطريق ليك',
    text: 'جهّز الفلوس كاش لو سمحت',
    icon: Bike,
    tone: 'from-brand-700 to-brand-500',
  },
  delivered: {
    title: 'وصلك بالهنا والشفا',
    text: 'شكراً إنك طلبت مننا',
    icon: CircleCheck,
    tone: 'from-emerald-600 to-brand-500',
  },
  rejected: {
    title: 'المحل اعتذر عن الطلب',
    text: '',
    icon: CircleX,
    tone: 'from-ink-700 to-ink-500',
  },
  cancelled: { title: 'الطلب اتلغى', text: '', icon: CircleX, tone: 'from-ink-700 to-ink-500' },
};

export default function OrderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const dialog = useDialog();
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

  if (order.isPending) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
      </div>
    );
  }
  if (order.error) return <ErrorBox error={order.error} />;
  const o = order.data;
  const hero = HERO[o.status];
  const current = STEPS.findIndex((s) => s.status === o.status);
  const at = (s: OrderStatus) => o.events.find((e) => e.toStatus === s)?.createdAt ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <IconButton icon={ArrowRight} label="رجوع" onClick={() => navigate('/orders')} />
        <h1 className="text-lg font-bold">طلب {orderNo(o.number)}</h1>
      </div>

      <div
        className={cx(
          'relative overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-lift',
          hero.tone,
        )}
      >
        <div className="absolute -top-10 -left-10 size-44 rounded-full bg-white/10" />
        <img
          src={`/art/${HERO_ART[o.status]}.webp`}
          alt=""
          className="absolute top-3 left-3 size-24 drop-shadow-xl md:size-28"
        />
        <div className="relative max-w-[65%]">
          <div className="text-sm text-white/80">{o.storeName}</div>
          <h2 className="mt-1 text-2xl font-bold">{hero.title}</h2>
          {(hero.text || o.reason) && <p className="mt-1 text-white/85">{o.reason ?? hero.text}</p>}
        </div>

        {current >= 0 && (
          <div className="relative mt-6 flex items-start justify-between">
            <div className="absolute inset-x-5 top-5 h-1 rounded-full bg-white/25" />
            <div
              className="absolute start-5 top-5 h-1 rounded-full bg-white transition-all duration-700"
              style={{ width: `calc((100% - 2.5rem) * ${current / (STEPS.length - 1)})` }}
            />
            {STEPS.map((s, i) => (
              <div key={s.status} className="relative flex w-14 flex-col items-center gap-1.5">
                <span
                  className={cx(
                    'flex size-10 items-center justify-center rounded-full transition',
                    i <= current
                      ? cx(
                          'bg-white',
                          o.status === 'delivered' ? 'text-emerald-600' : 'text-brand-600',
                        )
                      : 'bg-white/20 text-white/70',
                    i === current && o.status !== 'delivered' && 'animate-ring',
                  )}
                >
                  <s.icon className="size-5" strokeWidth={2.2} />
                </span>
                <span
                  className={cx(
                    'text-[11px] font-medium',
                    i <= current ? 'text-white' : 'text-white/60',
                  )}
                >
                  {s.label}
                </span>
                <span className="tabular text-[10px] text-white/70">
                  {at(s.status) ? time(at(s.status)) : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {o.driverName && o.status !== 'delivered' && current >= 0 && (
        <Card className="flex items-center gap-3">
          <Avatar name={o.driverName} />
          <div className="flex-1">
            <div className="text-xs text-ink-500">الطيار</div>
            <div className="font-bold">{o.driverName}</div>
          </div>
          {o.driverPhone && (
            <a href={`tel:${o.driverPhone}`}>
              <Button variant="soft" icon={Phone}>
                اتصل
              </Button>
            </a>
          )}
        </Card>
      )}

      {o.status === 'delivered' && !o.rated && (
        <RateCard orderId={o.id} hasDriver={Boolean(o.driverId)} />
      )}
      {o.rated && (
        <Card className="flex items-center gap-3 text-emerald-700">
          <Star className="size-5 fill-amber-400 text-amber-400" /> شكراً على تقييمك، ده بيساعدنا
          نتحسن
        </Card>
      )}

      <Card>
        <SectionTitle icon={ScrollText}>تفاصيل الطلب</SectionTitle>
        <ul className="tabular space-y-2.5 text-sm">
          {o.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>
                <span className="me-2 inline-flex min-w-6 justify-center rounded-lg bg-ink-100 px-1.5 text-xs font-bold text-ink-700">
                  {num(it.quantity)}×
                </span>
                {it.name}
              </span>
              <Money value={it.lineTotal} />
            </li>
          ))}
        </ul>
        <dl className="tabular mt-4 space-y-2 border-t border-dashed border-ink-200 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-500">المنتجات</dt>
            <dd>
              <Money value={o.subtotal} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-500">التوصيل</dt>
            <dd>
              <Money value={o.deliveryFee} />
            </dd>
          </div>
          <div className="flex justify-between pt-1 text-base font-bold">
            <dt>الإجمالي (كاش)</dt>
            <dd>
              <Money value={o.total} />
            </dd>
          </div>
        </dl>
        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-ink-50 p-3 text-sm text-ink-600">
          <MapPin className="mt-0.5 size-4 shrink-0" /> {o.addressText}
        </div>
      </Card>

      {o.status === 'placed' && (
        <Button
          variant="secondary"
          block
          className="text-rose-600"
          loading={cancel.isPending}
          onClick={async () => {
            const ok = await dialog.confirm({
              title: 'تلغي الطلب؟',
              description: 'المحل لسه ماقبلش الطلب، فتقدر تلغيه من غير أي مشكلة.',
              confirmLabel: 'أيوه، الغي الطلب',
              danger: true,
              icon: CircleX,
            });
            if (ok) cancel.mutate();
          }}
        >
          إلغاء الطلب
        </Button>
      )}
      {cancel.error && <ErrorBox error={cancel.error} />}
    </div>
  );
}

function Stars({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-medium">{label}</span>
      <div className="flex gap-1" dir="ltr" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${num(n)} من ٥`}
            onClick={() => onChange(n)}
            className="cursor-pointer p-0.5 transition active:scale-90"
          >
            <Star
              className={cx(
                'size-8',
                n <= value ? 'fill-amber-400 text-amber-400' : 'text-ink-200',
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function RateCard({ orderId, hasDriver }: { orderId: string; hasDriver: boolean }) {
  const [store, setStore] = useState(0);
  const [driver, setDriver] = useState(0);
  const toast = useToast();
  const queryClient = useQueryClient();
  const rate = useMutation({
    mutationFn: () =>
      post(`/orders/${orderId}/rate`, {
        storeRating: store,
        ...(hasDriver && driver ? { driverRating: driver } : {}),
      }),
    onSuccess: () => {
      toast('شكراً على تقييمك');
      void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    },
  });
  return (
    <Card className="space-y-4 ring-brand-200">
      <div>
        <h2 className="font-bold">إيه رأيك في الطلب؟</h2>
        <p className="text-sm text-ink-500">تقييمك بيساعد غيرك يختار صح</p>
      </div>
      <Stars label="المحل" value={store} onChange={setStore} />
      {hasDriver && <Stars label="الطيار" value={driver} onChange={setDriver} />}
      {rate.error && <ErrorBox error={rate.error} />}
      <Button block disabled={store === 0} loading={rate.isPending} onClick={() => rate.mutate()}>
        إرسال التقييم
      </Button>
    </Card>
  );
}
