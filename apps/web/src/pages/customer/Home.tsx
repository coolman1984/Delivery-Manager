import {
  ACTIVE_ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  STORE_TYPES,
  type StoreType,
} from '@dm/shared';
import { useQuery } from '@tanstack/react-query';
import { Banknote, ChevronLeft, MapPin, Search, Star, Store as StoreIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { cx, EmptyState, ErrorBox, Input, Skeleton } from '../../components/ui';
import { get } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { greeting, num, orderNo } from '../../lib/format';
import type { Order, StoreSummary } from '../../lib/types';
import { STORE_VISUAL } from '../../lib/visuals';

export default function Home() {
  const { user } = useAuth();
  const [type, setType] = useState<StoreType | null>(null);
  const [search, setSearch] = useState('');
  const stores = useQuery({
    queryKey: ['catalog', 'stores'],
    queryFn: () => get<StoreSummary[]>('/catalog/stores'),
  });

  const visible = useMemo(() => {
    const q = search.trim();
    return (stores.data ?? [])
      .filter((s) => !type || s.type === type)
      .filter((s) => !q || s.name.includes(q))
      .sort((a, b) => Number(b.isOpen) - Number(a.isOpen));
  }, [stores.data, type, search]);

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm text-ink-500">
          {greeting()}
          {user ? `، ${user.name.split(' ')[0]}` : ''}
        </p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-ink-900 md:text-3xl">
          عايز نوصّلك إيه النهارده؟
        </h1>
        <div className="mt-4">
          <Input
            icon={Search}
            placeholder="دوّر على مطعم أو صيدلية أو محل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="بحث"
            className="h-13 bg-white shadow-card ring-ink-200/60"
          />
        </div>
      </section>

      {user && <ActiveOrderBanner />}

      <section className="grid grid-cols-3 gap-3">
        {STORE_TYPES.filter((t) => t !== 'other').map((t) => {
          const v = STORE_VISUAL[t];
          const active = type === t;
          return (
            <button
              key={t}
              onClick={() => setType(active ? null : t)}
              aria-pressed={active}
              className={cx(
                'group flex cursor-pointer flex-col items-center gap-2 rounded-3xl p-4 transition active:scale-[0.97]',
                active
                  ? 'bg-ink-900 text-white shadow-lift'
                  : 'bg-white shadow-card ring-1 ring-ink-200/60 hover:shadow-lift',
              )}
            >
              <span
                className={cx(
                  'flex size-14 items-center justify-center rounded-2xl transition',
                  active ? 'bg-white/10 text-white' : cx(v.tile, v.iconColor),
                )}
              >
                <v.icon className="size-7" strokeWidth={2} />
              </span>
              <span className="text-sm font-semibold">{v.label}</span>
            </button>
          );
        })}
      </section>

      <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-100">
        <Banknote className="size-5 shrink-0" />
        الدفع كاش عند الاستلام، ومن غير أي رسوم زيادة
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">{type ? STORE_VISUAL[type].label : 'كل المحلات'}</h2>
          {stores.data && <span className="text-sm text-ink-500">{num(visible.length)} محل</span>}
        </div>
        {stores.error && <ErrorBox error={stores.error} />}
        {stores.isPending && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-52 rounded-3xl" />
            ))}
          </div>
        )}
        {stores.data && visible.length === 0 && (
          <EmptyState
            icon={StoreIcon}
            title="مالقيناش محلات"
            text="جرّب تدوّر بكلمة تانية أو اختار نوع تاني"
          />
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => (
            <StoreCard key={s.id} store={s} />
          ))}
        </div>
      </section>
    </div>
  );
}

function StoreCard({ store }: { store: StoreSummary }) {
  const v = STORE_VISUAL[store.type];
  return (
    <Link
      to={`/stores/${store.id}`}
      className="group overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-ink-200/60 transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className={cx('relative h-28 bg-gradient-to-br', v.cover, !store.isOpen && 'grayscale')}>
        <v.icon className="absolute -bottom-4 left-4 size-28 text-white/25" strokeWidth={1.5} />
        <div className="absolute start-4 bottom-0 translate-y-1/2">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-white shadow-card">
            <v.icon className={cx('size-7', v.iconColor)} />
          </div>
        </div>
        <span
          className={cx(
            'absolute end-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur',
            store.isOpen ? 'bg-white/90 text-emerald-700' : 'bg-ink-900/70 text-white',
          )}
        >
          {store.isOpen ? 'مفتوح' : 'مقفول دلوقتي'}
        </span>
      </div>
      <div className="px-4 pt-10 pb-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold text-ink-900">{store.name}</h3>
          {store.rating ? (
            <span className="tabular flex shrink-0 items-center gap-1 text-sm font-semibold text-ink-800">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              {num(store.rating)}
              <span className="font-normal text-ink-400">({num(store.ratingCount ?? 0)})</span>
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
              جديد
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-sm text-ink-500">
          <span>{v.label}</span>
          <span className="text-ink-300">•</span>
          <MapPin className="size-3.5" />
          <span>{store.zoneName}</span>
        </div>
      </div>
    </Link>
  );
}

function ActiveOrderBanner() {
  const orders = useQuery({ queryKey: ['orders', 'mine'], queryFn: () => get<Order[]>('/orders') });
  const active = orders.data?.find((o) => ACTIVE_ORDER_STATUSES.includes(o.status));
  if (!active) return null;
  return (
    <Link
      to={`/orders/${active.id}`}
      className="flex items-center gap-3 rounded-3xl bg-ink-900 p-4 text-white shadow-lift transition hover:bg-ink-800"
    >
      <span className="relative flex size-11 items-center justify-center rounded-2xl bg-brand-600">
        <span className="animate-ring absolute inset-0 rounded-2xl" />
        <StoreIcon className="size-5" />
      </span>
      <div className="flex-1">
        <div className="text-xs text-ink-300">
          طلبك {orderNo(active.number)} من {active.storeName}
        </div>
        <div className="font-bold">{ORDER_STATUS_LABELS[active.status]}</div>
      </div>
      <span className="flex items-center text-sm text-brand-300">
        تابع <ChevronLeft className="size-4" />
      </span>
    </Link>
  );
}
