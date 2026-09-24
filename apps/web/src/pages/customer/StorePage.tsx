import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock, MapPin, Minus, Plus, Search, ShoppingBag, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useDialog } from '../../components/dialog';
import { ProductImage, StoreCover, StoreLogo } from '../../components/visual';
import { cx, ErrorBox, IconButton, Money, Skeleton } from '../../components/ui';
import { get } from '../../lib/api';
import { useSelectedAddress } from '../../lib/address';
import { useCart } from '../../lib/cart';
import { money, num } from '../../lib/format';
import type { Product, StoreDetail } from '../../lib/types';
import { eta, STORE_VISUAL } from '../../lib/visuals';

export default function StorePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const dialog = useDialog();
  const { address } = useSelectedAddress();
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const store = useQuery({
    queryKey: ['catalog', 'store', id],
    queryFn: () => get<StoreDetail>(`/catalog/stores/${id}`),
  });

  const groups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of store.data?.products ?? []) {
      if (search && !p.name.includes(search.trim())) continue;
      const key = p.category ?? 'منتجات';
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map];
  }, [store.data, search]);

  if (store.isPending) {
    return (
      <div className="-mx-4 -mt-5 space-y-4 md:mx-0 md:mt-0">
        <Skeleton className="h-52 rounded-none md:rounded-3xl" />
        <div className="space-y-3 px-4">
          <Skeleton className="h-28 rounded-3xl" />
          <Skeleton className="h-28 rounded-3xl" />
        </div>
      </div>
    );
  }
  if (store.error) return <ErrorBox error={store.error} />;
  const s = store.data;
  const v = STORE_VISUAL[s.type];

  const qty = (pid: string) =>
    cart.storeId === s.id ? (cart.lines.find((l) => l.product.id === pid)?.quantity ?? 0) : 0;

  async function add(p: Product) {
    if (cart.storeId && cart.storeId !== s.id && cart.count > 0) {
      const ok = await dialog.confirm({
        title: 'تبدأ سلة جديدة؟',
        description: `السلة فيها حاجات من ${cart.storeName}. لو كمّلت، هتتمسح وتبدأ من ${s.name}.`,
        confirmLabel: 'أيوه، سلة جديدة',
        icon: ShoppingBag,
      });
      if (!ok) return;
    }
    cart.add(s.id, s.name, p);
  }

  const showCartBar = cart.storeId === s.id && cart.count > 0;

  return (
    <div className={cx('-mx-4 -mt-5 md:mx-0 md:mt-0', showCartBar && 'pb-24')}>
      <div className="relative">
        <StoreCover
          type={s.type}
          url={s.coverUrl}
          closed={!s.isOpen}
          className="h-52 md:h-64 md:rounded-3xl"
        />
        <div className="absolute start-4 top-4">
          <IconButton icon={ArrowRight} label="رجوع" tone="white" onClick={() => navigate(-1)} />
        </div>
      </div>

      <div className="relative z-10 -mt-8 px-4 md:px-0">
        <div className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-200/60 md:mx-6">
          <div className="flex items-center gap-4">
            <StoreLogo
              name={s.name}
              url={s.logoUrl}
              className="-mt-12 size-20 text-2xl md:size-24"
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-ink-900 md:text-2xl">{s.name}</h1>
              <div className="text-sm text-ink-500">{v.label}</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 divide-x divide-x-reverse divide-ink-100 rounded-2xl bg-ink-50 py-3 text-center text-sm">
            <div>
              <div className="flex items-center justify-center gap-1 font-bold">
                <Star className="size-4 fill-sun-400 text-sun-400" />
                {s.rating ? num(s.rating) : 'جديد'}
              </div>
              <div className="text-xs text-ink-500">
                {s.ratingCount ? `${num(s.ratingCount)} تقييم` : 'لسه مفيش تقييمات'}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-center gap-1 font-bold">
                <Clock className="size-4 text-ink-500" /> {eta(s.prepMinutes)}
              </div>
              <div className="text-xs text-ink-500">وقت التوصيل</div>
            </div>
            <div>
              <div className="font-bold">{address ? money(address.deliveryFee) : '—'}</div>
              <div className="text-xs text-ink-500">التوصيل</div>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-sm text-ink-500">
            <MapPin className="size-4" /> {s.address}
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-20 mt-4 bg-canvas/95 px-4 py-2 backdrop-blur md:top-16 md:px-0">
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`دوّر في ${s.name}`}
            aria-label="بحث في المنتجات"
            className="h-11 w-full rounded-2xl border-0 bg-white ps-10 pe-4 text-sm ring-1 ring-ink-200 focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>
        {groups.length > 1 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {groups.map(([c]) => (
              <button
                key={c}
                onClick={() => {
                  setActiveCat(c);
                  document
                    .getElementById(`cat-${c}`)
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className={cx(
                  'shrink-0 cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition',
                  activeCat === c
                    ? 'bg-ink-900 text-white'
                    : 'bg-white text-ink-700 ring-1 ring-ink-200',
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-2 space-y-7 px-4 md:px-0">
        {groups.map(([category, items]) => (
          <section key={category} id={`cat-${category}`} className="scroll-mt-40">
            <h2 className="mb-3 text-lg font-bold text-ink-900">{category}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((p) => {
                const q = qty(p.id);
                return (
                  <div
                    key={p.id}
                    className={cx(
                      'flex gap-3 rounded-3xl bg-white p-3 shadow-card ring-1 transition',
                      q > 0 ? 'ring-2 ring-brand-400' : 'ring-ink-200/60',
                    )}
                  >
                    <div className="flex min-w-0 flex-1 flex-col py-1">
                      <div className="font-bold text-ink-900">{p.name}</div>
                      {p.description && (
                        <div className="mt-0.5 line-clamp-2 text-xs text-ink-500">
                          {p.description}
                        </div>
                      )}
                      <Money
                        value={p.price}
                        className="mt-auto pt-2 text-base font-bold text-ink-900"
                      />
                    </div>
                    <div className="relative">
                      <ProductImage url={p.imageUrl} name={p.name} className="size-28" />
                      {q > 0 ? (
                        <div className="absolute inset-x-1 -bottom-2 flex items-center justify-between rounded-full bg-white p-0.5 shadow-lift ring-1 ring-ink-100">
                          <button
                            onClick={() => cart.setQuantity(p.id, q + 1)}
                            aria-label="زوّد"
                            className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white"
                          >
                            <Plus className="size-4" strokeWidth={2.5} />
                          </button>
                          <span className="tabular font-bold">{num(q)}</span>
                          <button
                            onClick={() => cart.setQuantity(p.id, q - 1)}
                            aria-label="قلّل"
                            className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-ink-100 text-ink-800"
                          >
                            <Minus className="size-4" strokeWidth={2.5} />
                          </button>
                        </div>
                      ) : (
                        <button
                          disabled={!s.isOpen}
                          onClick={() => void add(p)}
                          aria-label={`إضافة ${p.name}`}
                          className="absolute -bottom-2 start-1/2 flex size-10 translate-x-1/2 cursor-pointer items-center justify-center rounded-full bg-white text-brand-700 shadow-lift ring-1 ring-ink-100 transition hover:bg-brand-600 hover:text-white active:scale-90 disabled:cursor-not-allowed disabled:text-ink-300"
                        >
                          <Plus className="size-5" strokeWidth={2.6} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {groups.length === 0 && (
          <p className="py-10 text-center text-ink-500">مفيش منتجات بالاسم ده</p>
        )}
      </div>

      {showCartBar && (
        <div className="fixed inset-x-0 bottom-20 z-30 px-4 md:bottom-6">
          <Link
            to="/cart"
            className="animate-slide-up mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-brand-600 p-2 pe-5 text-white shadow-lift"
          >
            <span className="tabular flex size-11 items-center justify-center rounded-xl bg-white/20 font-bold">
              {num(cart.count)}
            </span>
            <span className="flex-1 font-bold">عرض السلة</span>
            <Money value={cart.subtotal} className="font-bold" />
          </Link>
        </div>
      )}
    </div>
  );
}

export function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full bg-ink-100 p-1">
      <button
        onClick={() => onChange(value + 1)}
        aria-label="زوّد"
        className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-brand-600 text-white active:scale-95"
      >
        <Plus className="size-4" strokeWidth={2.5} />
      </button>
      <span className="tabular w-6 text-center font-bold">{num(value)}</span>
      <button
        onClick={() => onChange(value - 1)}
        aria-label="قلّل"
        className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-white text-ink-800 shadow-card active:scale-95"
      >
        <Minus className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
