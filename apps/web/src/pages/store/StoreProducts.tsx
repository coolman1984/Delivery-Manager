import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button, Card, ErrorBox, Input, Loading, PageTitle } from '../../components/ui';
import { useToast } from '../../components/toast';
import { get, patch, post } from '../../lib/api';
import { money, toPiasters } from '../../lib/format';
import type { Product } from '../../lib/types';

export default function StoreProducts() {
  const products = useQuery({
    queryKey: ['store-products'],
    queryFn: () => get<Product[]>('/store/products'),
  });
  const [adding, setAdding] = useState(false);
  if (products.isPending) return <Loading />;
  if (products.error) return <ErrorBox error={products.error} />;
  return (
    <div>
      <PageTitle
        action={
          <Button variant="secondary" onClick={() => setAdding((v) => !v)}>
            {adding ? 'إغلاق' : '+ منتج جديد'}
          </Button>
        }
      >
        المنتجات والأسعار
      </PageTitle>
      {adding && <NewProduct onDone={() => setAdding(false)} />}
      <div className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
        {products.data.map((p) => (
          <ProductRow key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}

function ProductRow({ product }: { product: Product }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(String(product.price / 100));
  const update = useMutation({
    mutationFn: (body: Partial<Product>) => patch(`/store/products/${product.id}`, body),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['store-products'] });
      toast('اتحفظ ✅');
    },
    onError: (err) => toast(err.message, 'error'),
  });

  function savePrice(e: FormEvent) {
    e.preventDefault();
    const value = toPiasters(price);
    if (!Number.isInteger(value) || value <= 0) return toast('السعر غلط', 'error');
    update.mutate({ price: value });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-40 flex-1">
        <div className={`font-medium ${product.isAvailable ? '' : 'text-slate-400 line-through'}`}>
          {product.name}
        </div>
        <div className="text-xs text-slate-500">{product.category}</div>
      </div>
      {editing ? (
        <form onSubmit={savePrice} className="flex items-center gap-2">
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            className="w-24 rounded-lg border border-slate-300 px-2 py-2"
            autoFocus
          />
          <Button type="submit" loading={update.isPending}>
            حفظ
          </Button>
        </form>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="tabular rounded-lg px-2 py-1 font-semibold text-brand-700 hover:bg-brand-50"
        >
          {money(product.price)} ✏️
        </button>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={product.isAvailable}
          onChange={(e) => update.mutate({ isAvailable: e.target.checked })}
          className="size-5 accent-brand-600"
        />
        متاح
      </label>
    </div>
  );
}

function NewProduct({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const create = useMutation({
    mutationFn: () =>
      post('/store/products', {
        name,
        price: toPiasters(price),
        ...(category ? { category } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['store-products'] });
      onDone();
    },
  });
  return (
    <Card className="mb-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
        className="grid gap-3 sm:grid-cols-3"
      >
        <Input
          label="اسم المنتج"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
        />
        <Input
          label="القسم"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          maxLength={40}
        />
        <Input
          label="السعر بالجنيه"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          dir="ltr"
          required
        />
        {create.error && (
          <div className="sm:col-span-3">
            <ErrorBox error={create.error} />
          </div>
        )}
        <Button type="submit" loading={create.isPending} className="sm:col-span-3">
          إضافة
        </Button>
      </form>
    </Card>
  );
}
