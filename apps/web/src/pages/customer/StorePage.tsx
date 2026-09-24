import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { Button, ErrorBox, Loading } from '../../components/ui';
import { get } from '../../lib/api';
import { useCart } from '../../lib/cart';
import { money } from '../../lib/format';
import type { Product, StoreDetail } from '../../lib/types';

export default function StorePage() {
  const { id } = useParams();
  const cart = useCart();
  const store = useQuery({
    queryKey: ['catalog', 'store', id],
    queryFn: () => get<StoreDetail>(`/catalog/stores/${id}`),
  });

  if (store.isPending) return <Loading />;
  if (store.error) return <ErrorBox error={store.error} />;
  const s = store.data;

  const groups = new Map<string, Product[]>();
  for (const p of s.products) {
    const key = p.category ?? 'منتجات';
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  const inCart = (pid: string) =>
    (cart.storeId === s.id ? cart.lines.find((l) => l.product.id === pid)?.quantity : 0) ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">{s.name}</h1>
        <p className="text-sm text-slate-500">{s.address}</p>
        {!s.isOpen && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
            المحل مقفول دلوقتي، تقدر تتفرج بس
          </p>
        )}
        {cart.storeId && cart.storeId !== s.id && (
          <p className="mt-2 rounded-lg bg-sky-50 p-2 text-sm text-sky-800">
            السلة فيها حاجات من {cart.storeName}. لو ضفت من هنا السلة القديمة هتتمسح.
          </p>
        )}
      </div>

      {[...groups].map(([category, items]) => (
        <section key={category}>
          <h2 className="mb-2 text-sm font-bold text-slate-500">{category}</h2>
          <div className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
            {items.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3">
                <div className="flex-1">
                  <div className="font-medium">{p.name}</div>
                  {p.description && <div className="text-xs text-slate-500">{p.description}</div>}
                  <div className="tabular text-sm font-semibold text-brand-700">
                    {money(p.price)}
                  </div>
                </div>
                {inCart(p.id) > 0 ? (
                  <div className="flex items-center gap-2">
                    <QtyButton onClick={() => cart.setQuantity(p.id, inCart(p.id) - 1)}>
                      −
                    </QtyButton>
                    <span className="tabular w-5 text-center font-semibold">{inCart(p.id)}</span>
                    <QtyButton onClick={() => cart.setQuantity(p.id, inCart(p.id) + 1)}>
                      +
                    </QtyButton>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={!s.isOpen}
                    onClick={() => cart.add(s.id, s.name, p)}
                  >
                    إضافة
                  </Button>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {cart.storeId === s.id && cart.count > 0 && (
        <Link
          to="/cart"
          className="fixed inset-x-4 bottom-20 z-20 flex items-center justify-between rounded-2xl bg-brand-700 px-5 py-4 font-semibold text-white shadow-lg md:bottom-6 md:mx-auto md:max-w-md"
        >
          <span>🛒 كمّل الطلب ({cart.count})</span>
          <span className="tabular">{money(cart.subtotal)}</span>
        </Link>
      )}
    </div>
  );
}

export function QtyButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex size-9 items-center justify-center rounded-full bg-brand-50 text-lg font-bold text-brand-700"
    >
      {children}
    </button>
  );
}
