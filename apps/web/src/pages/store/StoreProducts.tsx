import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Search, Tag } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Modal, useDialog } from '../../components/dialog';
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
  Switch,
} from '../../components/ui';
import { get, patch, post } from '../../lib/api';
import { num, toPiasters } from '../../lib/format';
import type { Product } from '../../lib/types';
import { ImagePicker } from '../../components/ImagePicker';
import { ProductImage, StoreCover, StoreLogo } from '../../components/visual';
import type { StoreType } from '@dm/shared';

interface StoreMe {
  id: string;
  name: string;
  type: StoreType;
  prepMinutes: number;
  logoUrl: string | null;
  coverUrl: string | null;
}

/** شكل المحل عند العملاء: اللوجو والغلاف ووقت التحضير */
function StoreSettings() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();
  const me = useQuery({ queryKey: ['store-me'], queryFn: () => get<StoreMe>('/store/me') });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['store-me'] });
  const prep = useMutation({
    mutationFn: (prepMinutes: number) => patch('/store/me/prep', { prepMinutes }),
    onSuccess: () => {
      toast('اتحفظ');
      refresh();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  if (!me.data) return null;
  const s = me.data;

  async function editPrep() {
    const v = await dialog.prompt({
      title: 'وقت تحضير الطلب',
      description: 'متوسط الوقت اللي بتاخده عشان تجهّز الطلب. بيظهر للعميل كوقت متوقع للتوصيل.',
      label: 'بالدقايق',
      defaultValue: String(s.prepMinutes),
      inputMode: 'numeric',
      validate: (x) =>
        Number.isInteger(Number(x)) && Number(x) >= 5 && Number(x) <= 180
          ? null
          : 'من ٥ لـ ١٨٠ دقيقة',
    });
    if (v) prep.mutate(Number(v));
  }

  return (
    <Card padded={false} className="mb-6 overflow-hidden">
      <ImagePicker
        path="/store/me/cover"
        label="تغيير الغلاف"
        onUploaded={refresh}
        className="block w-full"
      >
        <StoreCover type={s.type} url={s.coverUrl} className="h-36" />
      </ImagePicker>
      <div className="flex flex-wrap items-center gap-4 px-5 pb-4">
        <ImagePicker
          path="/store/me/logo"
          label="تغيير اللوجو"
          onUploaded={refresh}
          className="-mt-8"
        >
          <StoreLogo name={s.name} url={s.logoUrl} className="size-20 text-2xl" />
        </ImagePicker>
        <div className="min-w-48 flex-1 pt-2">
          <div className="font-bold">شكل محلك عند العملاء</div>
          <div className="text-sm text-ink-500">دوس على الغلاف أو اللوجو عشان تغيّرهم</div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto"
          onClick={() => void editPrep()}
        >
          وقت التحضير: {num(s.prepMinutes)} دقيقة
        </Button>
      </div>
    </Card>
  );
}

export default function StoreProducts() {
  const products = useQuery({
    queryKey: ['store-products'],
    queryFn: () => get<Product[]>('/store/products'),
  });
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');

  const groups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products.data ?? []) {
      if (search && !p.name.includes(search.trim())) continue;
      const key = p.category ?? 'من غير قسم';
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map];
  }, [products.data, search]);

  const available = products.data?.filter((p) => p.isAvailable).length ?? 0;

  return (
    <div>
      <PageHeader
        title="المنتجات والأسعار"
        subtitle={
          products.data && `${num(products.data.length)} منتج · ${num(available)} متاح للطلب`
        }
        actions={
          <Button icon={Plus} onClick={() => setAdding(true)}>
            منتج جديد
          </Button>
        }
      />
      <StoreSettings />
      <div className="mb-5 max-w-md">
        <Input
          icon={Search}
          placeholder="دوّر على منتج"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="بحث"
        />
      </div>
      {products.isPending && <SkeletonList count={4} className="h-16" />}
      {products.error && <ErrorBox error={products.error} />}
      {products.data?.length === 0 && (
        <EmptyState
          icon={Tag}
          title="لسه مفيش منتجات"
          text="ضيف منتجاتك وأسعارها عشان العملاء يطلبوا"
          action={
            <Button icon={Plus} onClick={() => setAdding(true)}>
              أول منتج
            </Button>
          }
        />
      )}
      <div className="space-y-6">
        {groups.map(([category, items]) => (
          <section key={category}>
            <h2 className="mb-2 text-sm font-bold text-ink-500">{category}</h2>
            <Card padded={false} className="divide-y divide-ink-100">
              {items.map((p) => (
                <ProductRow key={p.id} product={p} />
              ))}
            </Card>
          </section>
        ))}
      </div>
      <NewProductModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function ProductRow({ product }: { product: Product }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();
  const update = useMutation({
    mutationFn: (body: Partial<Product>) => patch(`/store/products/${product.id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['store-products'] });
      toast('اتحفظ');
    },
    onError: (err) => toast(err.message, 'error'),
  });

  async function editPrice() {
    const value = await dialog.prompt({
      title: `سعر ${product.name}`,
      label: 'السعر الجديد',
      defaultValue: String(product.price / 100),
      inputMode: 'decimal',
      icon: Tag,
      validate: (v) => {
        const p = toPiasters(v);
        return Number.isInteger(p) && p > 0 ? null : 'اكتب سعر صحيح';
      },
    });
    if (value) update.mutate({ price: toPiasters(value) });
  }

  return (
    <div className="flex items-center gap-4 px-5 py-3.5">
      <ImagePicker
        path={`/store/products/${product.id}/image`}
        label={`صورة ${product.name}`}
        onUploaded={() => void queryClient.invalidateQueries({ queryKey: ['store-products'] })}
      >
        <ProductImage url={product.imageUrl} name={product.name} className="size-16" />
      </ImagePicker>
      <div className="min-w-0 flex-1">
        <div className={cx('font-semibold', !product.isAvailable && 'text-ink-400 line-through')}>
          {product.name}
        </div>
        {!product.isAvailable && <div className="text-xs text-ink-400">مش ظاهر للعملاء</div>}
      </div>
      <button
        onClick={() => void editPrice()}
        className="group flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold text-ink-900 transition hover:bg-brand-50 hover:text-brand-700"
      >
        <Money value={product.price} />
        <Pencil className="size-3.5 text-ink-300 group-hover:text-brand-600" />
      </button>
      <Switch
        checked={product.isAvailable ?? true}
        onChange={(v) => update.mutate({ isAvailable: v })}
        label={`${product.name} متاح`}
      />
    </div>
  );
}

function NewProductModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
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
      toast('المنتج اتضاف');
      void queryClient.invalidateQueries({ queryKey: ['store-products'] });
      setName('');
      setPrice('');
      onClose();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }
  return (
    <Modal open={open} onClose={onClose} title="منتج جديد" icon={Plus}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="اسم المنتج"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
        />
        <Input
          label="القسم"
          hint="مثلاً: مشويات، مشروبات، مسكنات"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          maxLength={40}
        />
        <Input
          label="السعر"
          suffix="ج.م"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          dir="ltr"
          required
        />
        {create.error && <ErrorBox error={create.error} />}
        <Button type="submit" size="lg" block loading={create.isPending}>
          إضافة المنتج
        </Button>
      </form>
    </Modal>
  );
}
