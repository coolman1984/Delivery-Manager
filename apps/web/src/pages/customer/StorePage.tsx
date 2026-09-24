import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Clock, MapPin, Minus, Plus, ShoppingBag, Star } from 'lucide-react';
import { useNavigate, useParams, Link } from 'react-router';
import { useDialog } from '../../components/dialog';
import { cx, ErrorBox, IconButton, Money, Skeleton } from '../../components/ui';
import { get } from '../../lib/api';
import { useCart } from '../../lib/cart';
import { num } from '../../lib/format';
import type { Product, StoreDetail } from '../../lib/types';
import { STORE_VISUAL } from '../../lib/visuals';

export default function StorePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cart = useCart();
  const dialog = useDialog();
  const store = useQuery({
    queryKey: ['catalog', 'store', id],
    queryFn: () => get<StoreDetail>(`/catalog/stores/${id}`),
  });

  if (store.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-44 rounded-3xl" />
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }
  if (store.error) return <ErrorBox error={store.error} />;
  const s = store.data;
  const v = STORE_VISUAL[s.type];

  const groups = new Map<string, Product[]>();
  for (const p of s.products) {
    const key = p.category ?? 'منتجات';
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
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
    <div className={cx('-mx-4 -mt-5', showCartBar && 'pb-24')}>
      <div
        className={cx(
          'relative h-44 bg-gradient-to-br md:mx-4 md:mt-5 md:rounded-3xl',
          v.cover,
          !s.isOpen && 'grayscale',
        )}
      >
        <v.icon className="absolute -bottom-6 left-6 size-44 text-white/20" strokeWidth={1.3} />
        <div className="absolute start-4 top-4">
          <IconButton icon={ArrowRight} label="رجوع" tone="white" onClick={() => navigate(-1)} />
        </div>
      </div>

      <div className="relative z-10 -mt-12 px-4">
        <div className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-ink-200/60">
          <div className="flex items-start gap-4">
            <div
              className={cx(
                'flex size-16 shrink-0 items-center justify-center rounded-2xl',
                v.tile,
              )}
            >
              <v.icon className={cx('size-8', v.iconColor)} />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-ink-900">{s.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
                {s.rating ? (
                  <span className="flex items-center gap-1 font-semibold text-ink-800">
                    <Star className="size-4 fill-amber-400 text-amber-400" /> {num(s.rating)}
                    <span className="font-normal text-ink-400">
                      ({num(s.ratingCount ?? 0)} تقييم)
                    </span>
                  </span>
                ) : (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                    جديد
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <MapPin className="size-4" /> {s.address}
                </span>
              </div>
            </div>
          </div>
          {!s.isOpen && (
            <div className="mt-4 flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <Clock className="size-4" /> المحل مقفول دلوقتي، تقدر تتفرج على المنتجات بس
            </div>
          )}
        </div>
      </div>

      {groups.size > 1 && (
        <div className="no-scrollbar sticky top-16 z-20 mt-4 flex gap-2 overflow-x-auto bg-canvas/95 px-4 py-2 backdrop-blur">
          {[...groups.keys()].map((c) => (
            <a
              key={c}
              href={`#cat-${c}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(`cat-${c}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink-700 shadow-card ring-1 ring-ink-200/60 hover:text-brand-700"
            >
              {c}
            </a>
          ))}
        </div>
      )}

      <div className="mt-2 space-y-6 px-4">
        {[...groups].map(([category, items]) => (
          <section key={category} id={`cat-${category}`} className="scroll-mt-32">
            <h2 className="mb-3 text-base font-bold text-ink-900">{category}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {items.map((p) => {
                const q = qty(p.id);
                return (
                  <div
                    key={p.id}
                    className={cx(
                      'flex items-center gap-3 rounded-3xl bg-white p-3 shadow-card ring-1 transition',
                      q > 0 ? 'ring-brand-300' : 'ring-ink-200/60',
                    )}
                  >
                    <div
                      className={cx(
                        'flex size-20 shrink-0 items-center justify-center rounded-2xl',
                        v.tile,
                      )}
                    >
                      <v.icon className={cx('size-9 opacity-80', v.iconColor)} strokeWidth={1.6} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-ink-900">{p.name}</div>
                      {p.description && (
                        <div className="line-clamp-2 text-xs text-ink-500">{p.description}</div>
                      )}
                      <Money value={p.price} className="mt-1 block font-bold text-brand-700" />
                    </div>
                    {q > 0 ? (
                      <Stepper value={q} onChange={(n) => cart.setQuantity(p.id, n)} />
                    ) : (
                      <button
                        disabled={!s.isOpen}
                        onClick={() => void add(p)}
                        aria-label={`إضافة ${p.name}`}
                        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl bg-brand-600 text-white shadow-brand transition hover:bg-brand-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:shadow-none"
                      >
                        <Plus className="size-5" strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {showCartBar && (
        <div className="fixed inset-x-0 bottom-20 z-30 px-4 md:bottom-6">
          <Link
            to="/cart"
            className="animate-slide-up mx-auto flex max-w-lg items-center gap-3 rounded-3xl bg-ink-900 p-2 ps-2 pe-5 text-white shadow-lift"
          >
            <span className="tabular flex size-11 items-center justify-center rounded-2xl bg-brand-600 font-bold">
              {num(cart.count)}
            </span>
            <span className="flex-1 font-semibold">عرض السلة</span>
            <Money value={cart.subtotal} className="font-bold" />
          </Link>
        </div>
      )}
    </div>
  );
}

export function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-2xl bg-brand-50 p-1">
      <button
        onClick={() => onChange(value + 1)}
        aria-label="زوّد"
        className="flex size-9 cursor-pointer items-center justify-center rounded-xl bg-white text-brand-700 shadow-card active:scale-95"
      >
        <Plus className="size-4" strokeWidth={2.5} />
      </button>
      <span className="tabular w-6 text-center font-bold text-brand-800">{num(value)}</span>
      <button
        onClick={() => onChange(value - 1)}
        aria-label="قلّل"
        className="flex size-9 cursor-pointer items-center justify-center rounded-xl bg-white text-brand-700 shadow-card active:scale-95"
      >
        <Minus className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}
