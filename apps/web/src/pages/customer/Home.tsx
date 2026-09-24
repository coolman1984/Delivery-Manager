import { ACTIVE_ORDER_STATUSES, ORDER_STATUS_LABELS, type StoreType } from '@dm/shared';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  Clock,
  MapPin,
  Search,
  Star,
  Store as StoreIcon,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { AddressSheet } from '../../components/AddressSheet';
import { JoinModal, type JoinType } from '../../components/JoinModal';
import { useTenant } from '../../components/Shell';
import { Art, StoreCover, StoreLogo } from '../../components/visual';
import { cx, EmptyState, ErrorBox, Skeleton } from '../../components/ui';
import { get } from '../../lib/api';
import { useSelectedAddress, useZones } from '../../lib/address';
import { useToast } from '../../components/toast';
import { useAuth } from '../../lib/auth';
import { money, num, orderNo } from '../../lib/format';
import type { Order, StoreSummary } from '../../lib/types';
import { eta, STORE_VISUAL } from '../../lib/visuals';

const CATEGORIES: StoreType[] = ['restaurant', 'grocery', 'pharmacy', 'other'];

export default function Home() {
  const { user } = useAuth();
  const tenant = useTenant();
  const [type, setType] = useState<StoreType | null>(null);
  const [search, setSearch] = useState('');
  const [pickingAddress, setPickingAddress] = useState(false);
  const [join, setJoin] = useState<JoinType | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { address } = useSelectedAddress();
  const zones = useZones();
  const stores = useQuery({
    queryKey: ['catalog', 'stores'],
    queryFn: () => get<StoreSummary[]>('/catalog/stores'),
  });
  const offers = useQuery({
    queryKey: ['catalog', 'offers'],
    queryFn: () => get<Offer[]>('/catalog/offers'),
  });

  const minFee = zones.data?.length ? Math.min(...zones.data.map((z) => z.deliveryFee)) : null;
  const feeLabel = address
    ? money(address.deliveryFee)
    : minFee !== null
      ? `من ${money(minFee)}`
      : '';

  const visible = useMemo(() => {
    const q = search.trim();
    return (stores.data ?? [])
      .filter((s) => !type || s.type === type)
      .filter((s) => !q || s.name.includes(q))
      .sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || (b.rating ?? 0) - (a.rating ?? 0));
  }, [stores.data, type, search]);
  const openNow = (stores.data ?? []).filter((s) => s.isOpen).slice(0, 8);

  function pickCategory(t: StoreType | null) {
    setType(t);
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="-mx-4 -mt-5 md:mx-0 md:mt-0">
      {/* ———— الهيدر: العنوان والبحث ———— */}
      <section className="relative overflow-hidden rounded-b-[32px] bg-brand-800 px-4 pt-4 pb-7 text-white md:rounded-[32px] md:px-10 md:py-12">
        <div className="absolute -top-16 -left-10 size-56 rounded-full bg-brand-600/50" />
        <div className="absolute -right-20 -bottom-24 size-64 rounded-full bg-brand-700" />
        <div className="absolute top-6 left-1/3 size-3 rounded-full bg-sun-400" />
        <Art
          name="scooter"
          className="absolute -bottom-3 left-4 hidden size-40 -scale-x-100 md:block"
        />
        <div className="relative">
          <button
            onClick={() => (user ? setPickingAddress(true) : undefined)}
            className="flex cursor-pointer items-center gap-1.5 text-start"
          >
            <MapPin className="size-5 text-sun-400" />
            <span className="text-sm text-brand-100">التوصيل على</span>
            <span className="max-w-[55vw] truncate font-bold">
              {address
                ? `${address.label}، ${address.zoneName}`
                : user
                  ? 'اختار عنوانك'
                  : (tenant.data?.governorate ?? '')}
            </span>
            {user && <ChevronDown className="size-4" />}
          </button>
          <h1 className="mt-5 hidden max-w-xl text-4xl leading-tight font-bold md:block">
            كل اللي محتاجه
            <br />
            <span className="text-sun-400">يوصلك لحد باب البيت</span>
          </h1>
          <div className="relative mt-4 md:mt-6 md:max-w-xl">
            <Search className="pointer-events-none absolute inset-y-0 start-4 my-auto size-5 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="دوّر على مطعم أو صيدلية أو سوبر ماركت"
              aria-label="بحث"
              className="h-13 w-full rounded-2xl border-0 bg-white ps-12 pe-10 text-ink-900 shadow-lift placeholder:text-ink-400 focus:ring-2 focus:ring-sun-400 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute inset-y-0 end-3 my-auto cursor-pointer text-ink-400"
                aria-label="مسح البحث"
              >
                <X className="size-5" />
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="space-y-8 px-4 pt-6 md:px-0">
        {/* ———— الأقسام ———— */}
        <section className="grid grid-cols-5 gap-2 md:gap-4">
          {CATEGORIES.map((t) => {
            const v = STORE_VISUAL[t];
            const active = type === t;
            return (
              <button
                key={t}
                onClick={() => pickCategory(active ? null : t)}
                aria-pressed={active}
                className="group flex cursor-pointer flex-col items-center gap-2"
              >
                <span
                  className={cx(
                    'flex aspect-square w-full items-center justify-center rounded-3xl transition md:aspect-[4/3]',
                    active
                      ? 'bg-brand-100 ring-2 ring-brand-500'
                      : 'bg-[#efe9dd] group-hover:bg-[#e8e0d0]',
                  )}
                >
                  <Art
                    name={v.art}
                    className="size-[62%] transition group-active:scale-90 md:size-24"
                  />
                </span>
                <span
                  className={cx(
                    'text-[13px] font-semibold md:text-base',
                    active ? 'text-brand-700' : 'text-ink-800',
                  )}
                >
                  {v.label}
                </span>
              </button>
            );
          })}
          <Link to="/errand" className="group flex cursor-pointer flex-col items-center gap-2">
            <span className="relative flex aspect-square w-full items-center justify-center rounded-3xl bg-violet-100 group-hover:bg-violet-200 md:aspect-[4/3]">
              <Art
                name="package"
                className="size-[62%] transition group-active:scale-90 md:size-24"
              />
              <span className="absolute -top-1.5 start-1/2 translate-x-1/2 rounded-full bg-violet-600 px-2 text-[10px] font-bold text-white">
                جديد
              </span>
            </span>
            <span className="text-[13px] font-semibold text-ink-800 md:text-base">مشاوير</span>
          </Link>
        </section>

        {user && <ActiveOrderBanner />}

        {/* ———— الإعلانات ———— */}
        {!search && (
          <section className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 md:mx-0 md:grid md:grid-cols-3 md:px-0">
            {offers.data?.map((o, i) => (
              <OfferBanner key={o.code} offer={o} index={i} />
            ))}
            <Banner
              tone="bg-sun-400 text-ink-900"
              title="الدفع كاش عند الباب"
              text="من غير كروت ولا تعقيد، ادفع للطيار لما يوصلك"
              arts={['purse', 'coin']}
            />
            <Banner
              tone="bg-orange-500 text-white"
              title={`مطاعم ${tenant.data?.governorate ?? ''} كلها هنا`}
              text="مشويات وبيتزا وكشري وسندوتشات"
              cta="اطلب دلوقتي"
              onClick={() => pickCategory('restaurant')}
              arts={['hamburger', 'fries']}
            />
            <Banner
              tone="bg-sky-500 text-white"
              title="دواك يوصلك لحد البيت"
              text="من أقرب صيدلية ليك وبنفس سعرها"
              cta="الصيدليات"
              onClick={() => pickCategory('pharmacy')}
              arts={['pill', 'bandage']}
            />
          </section>
        )}

        {/* ———— مفتوح دلوقتي ———— */}
        {!search && !type && openNow.length > 0 && (
          <section>
            <SectionHead title="مفتوح دلوقتي" hint="اطلب وهيوصلك بسرعة" />
            <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
              {openNow.map((s) => (
                <Link
                  key={s.id}
                  to={`/stores/${s.id}`}
                  className="flex w-64 shrink-0 items-center gap-3 rounded-3xl bg-white p-3 shadow-card ring-1 ring-ink-200/60 transition hover:shadow-lift"
                >
                  <StoreLogo name={s.name} url={s.logoUrl} className="size-16 text-xl" />
                  <div className="min-w-0">
                    <div className="truncate font-bold">{s.name}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-sm text-ink-500">
                      <Clock className="size-3.5" /> {eta(s.prepMinutes)}
                    </div>
                    {s.rating ? (
                      <div className="flex items-center gap-1 text-sm">
                        <Star className="size-3.5 fill-sun-400 text-sun-400" /> {num(s.rating)}
                      </div>
                    ) : (
                      <div className="text-xs font-semibold text-brand-700">جديد</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ———— كل المحلات ———— */}
        <section ref={listRef} className="scroll-mt-20">
          <SectionHead
            title={search ? `نتايج "${search}"` : type ? STORE_VISUAL[type].label : 'كل المحلات'}
            hint={stores.data ? `${num(visible.length)} محل` : undefined}
            action={
              type && (
                <button
                  onClick={() => setType(null)}
                  className="cursor-pointer text-sm font-semibold text-brand-700"
                >
                  عرض الكل
                </button>
              )
            }
          />
          {stores.error && <ErrorBox error={stores.error} />}
          {stores.isPending && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-60 rounded-3xl" />
              ))}
            </div>
          )}
          {stores.data && visible.length === 0 && (
            <EmptyState
              icon={StoreIcon}
              title="مالقيناش محلات"
              text="جرّب تدوّر بكلمة تانية أو اختار قسم تاني"
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((s) => (
              <StoreCard key={s.id} store={s} feeLabel={feeLabel} />
            ))}
          </div>
        </section>

        {/* ———— انضم لينا ———— */}
        <section className="grid gap-4 md:grid-cols-2">
          <JoinCard
            art="handshake"
            title="انضم لينا كشريك"
            text="وصّل محلك لعملاء أكتر في محافظتك، وزوّد مبيعاتك من غير ما تشيل هم التوصيل."
            cta="سجّل محلك"
            onClick={() => setJoin('store')}
          />
          <JoinCard
            art="courier"
            title="اشتغل طيار معانا"
            text="شغل منتظم ومرتب ثابت، وإنت اللي بتحدد إمتى تبدأ وإمتى تقفل."
            cta="قدّم دلوقتي"
            onClick={() => setJoin('driver')}
          />
        </section>

        {/* ———— المناطق ———— */}
        {zones.data && zones.data.length > 0 && (
          <section>
            <SectionHead title={`المناطق اللي بنوصلها في ${tenant.data?.governorate ?? ''}`} />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {zones.data.map((z) => (
                <div
                  key={z.id}
                  className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 ring-1 ring-ink-200/60"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <MapPin className="size-4 text-brand-600" /> {z.name}
                  </span>
                  <span className="text-sm text-ink-500">توصيل {money(z.deliveryFee)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {!user && (
        <div className="fixed inset-x-0 bottom-[calc(4.4rem+env(safe-area-inset-bottom))] z-20 px-3 md:hidden">
          <Link
            to="/login"
            state={{ from: '/' }}
            className="flex items-center gap-3 rounded-2xl bg-brand-600 px-4 py-3 text-white shadow-lift"
          >
            <Art name="gift" className="size-9" />
            <span className="flex-1 text-sm">
              <b className="rounded-md bg-sun-400 px-1.5 py-0.5 text-ink-900">اعمل حسابك</b> واطلب
              في ثواني
            </span>
            <ChevronLeft className="size-5" />
          </Link>
        </div>
      )}

      <AddressSheet open={pickingAddress} onClose={() => setPickingAddress(false)} />
      <JoinModal type={join} onClose={() => setJoin(null)} />
    </div>
  );
}

function SectionHead({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-ink-900">{title}</h2>
        {hint && <p className="text-sm text-ink-500">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

function Banner({
  tone,
  title,
  text,
  cta,
  onClick,
  arts,
}: {
  tone: string;
  title: string;
  text: string;
  cta?: string;
  onClick?: () => void;
  arts: [string, string];
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'relative flex h-40 w-[86%] shrink-0 snap-center cursor-pointer flex-col items-start justify-center overflow-hidden rounded-3xl p-5 text-start shadow-card md:w-auto',
        tone,
      )}
    >
      <div className="absolute -bottom-10 -left-10 size-44 rounded-full bg-white/20" />
      <Art name={arts[0]} className="absolute bottom-2 left-3 size-24 -rotate-6" />
      <Art name={arts[1]} className="absolute top-3 left-24 size-12 rotate-12" />
      <div className="relative max-w-[58%]">
        <div className="text-lg leading-snug font-bold">{title}</div>
        <div className="mt-1 text-sm opacity-90">{text}</div>
        {cta && (
          <span className="mt-3 inline-block rounded-full bg-ink-900 px-3 py-1 text-xs font-semibold text-white">
            {cta}
          </span>
        )}
      </div>
    </button>
  );
}

function StoreCard({ store, feeLabel }: { store: StoreSummary; feeLabel: string }) {
  const v = STORE_VISUAL[store.type];
  return (
    <Link
      to={`/stores/${store.id}`}
      className="group overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-ink-200/60 transition hover:-translate-y-0.5 hover:shadow-lift"
    >
      <div className="relative">
        <StoreCover
          type={store.type}
          url={store.coverUrl}
          closed={!store.isOpen}
          className="h-40"
        />
        <div className="absolute start-4 -bottom-7">
          <StoreLogo name={store.name} url={store.logoUrl} className="size-16 text-xl" />
        </div>
      </div>
      <div className="px-4 pt-9 pb-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[17px] font-bold text-ink-900">{store.name}</h3>
          {store.rating ? (
            <span className="tabular flex shrink-0 items-center gap-1 text-sm font-semibold">
              <Star className="size-4 fill-sun-400 text-sun-400" /> {num(store.rating)}
              <span className="font-normal text-ink-400">({num(store.ratingCount ?? 0)})</span>
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
              جديد
            </span>
          )}
        </div>
        <div className="mt-1 text-sm text-ink-500">
          {v.label} · {store.zoneName}
        </div>
        <div className="mt-3 flex items-center gap-3 border-t border-ink-100 pt-3 text-sm text-ink-600">
          <span className="flex items-center gap-1">
            <Clock className="size-4 text-ink-400" /> {eta(store.prepMinutes)}
          </span>
          {feeLabel && (
            <span className="flex items-center gap-1">
              <Art name="scooter" className="size-5 drop-shadow-none" /> {feeLabel}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function JoinCard({
  art,
  title,
  text,
  cta,
  onClick,
}: {
  art: string;
  title: string;
  text: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-3xl bg-[#efe9dd] p-5">
      <div className="min-w-0 flex-1">
        <h3 className="text-lg font-bold">{title}</h3>
        <p className="mt-1 text-sm text-ink-600">{text}</p>
        <button
          onClick={onClick}
          className="mt-4 cursor-pointer rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-brand hover:bg-brand-700"
        >
          {cta}
        </button>
      </div>
      <Art name={art} className="size-24 shrink-0" />
    </div>
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
      <span className="relative flex size-12 items-center justify-center rounded-2xl bg-brand-600">
        <span className="animate-ring absolute inset-0 rounded-2xl" />
        <Art name="courier" className="size-9 drop-shadow-none" />
      </span>
      <div className="flex-1">
        <div className="text-xs text-ink-300">
          طلبك {orderNo(active.number)} من {active.storeName}
        </div>
        <div className="font-bold">{ORDER_STATUS_LABELS[active.status]}</div>
      </div>
      <span className="flex items-center text-sm text-sun-400">
        تابع <ChevronLeft className="size-4" />
      </span>
    </Link>
  );
}

interface Offer {
  code: string;
  title: string;
  kind: 'percent' | 'fixed' | 'free_delivery';
  value: number;
  minSubtotal: number;
  firstOrderOnly: boolean;
}

const OFFER_STYLES = [
  'bg-brand-700 text-white',
  'bg-rose-500 text-white',
  'bg-violet-600 text-white',
];
const OFFER_ART: Record<Offer['kind'], string> = {
  percent: 'party',
  fixed: 'gift',
  free_delivery: 'scooter',
};

function OfferBanner({ offer, index }: { offer: Offer; index: number }) {
  const toast = useToast();
  const headline =
    offer.kind === 'percent'
      ? `خصم ${num(offer.value / 100)}٪`
      : offer.kind === 'fixed'
        ? `خصم ${money(offer.value)}`
        : 'توصيل مجاني';
  return (
    <button
      onClick={() => {
        void navigator.clipboard?.writeText(offer.code).catch(() => undefined);
        toast(`اتنسخ الكود ${offer.code}، استخدمه في السلة`);
      }}
      className={cx(
        'relative flex h-40 w-[86%] shrink-0 snap-center cursor-pointer flex-col items-start justify-center overflow-hidden rounded-3xl p-5 text-start shadow-card md:w-auto',
        OFFER_STYLES[index % OFFER_STYLES.length],
      )}
    >
      <div className="absolute -bottom-10 -left-10 size-44 rounded-full bg-white/15" />
      <Art name={OFFER_ART[offer.kind]} className="absolute bottom-3 left-3 size-24 -rotate-6" />
      <div className="relative max-w-[60%]">
        <div className="text-2xl leading-tight font-extrabold">{headline}</div>
        <div className="mt-1 text-sm opacity-90">{offer.title}</div>
        <span
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-sun-400 px-3 py-1 text-xs font-bold text-ink-900"
          dir="ltr"
        >
          {offer.code}
        </span>
      </div>
    </button>
  );
}
