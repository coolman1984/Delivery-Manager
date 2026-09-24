import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Check,
  MapPin,
  MapPinned,
  Plus,
  ShoppingBag,
  StickyNote,
  Wallet,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Modal } from '../../components/dialog';
import {
  Button,
  Card,
  cx,
  EmptyState,
  ErrorBox,
  Input,
  Money,
  SectionTitle,
  Select,
  SkeletonList,
  Textarea,
} from '../../components/ui';
import { get, post } from '../../lib/api';
import { useCart } from '../../lib/cart';
import { money } from '../../lib/format';
import type { Address, Order, Zone } from '../../lib/types';
import { Stepper } from './StorePage';

export default function Checkout() {
  const cart = useCart();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const addresses = useQuery({
    queryKey: ['addresses'],
    queryFn: () => get<Address[]>('/me/addresses'),
  });
  const [addressId, setAddressId] = useState<string>('');
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  // رقم ثابت لمحاولة الطلب دي: لو النت فصل وضغط تاني، الطلب مايتكررش
  const [requestId] = useState(() => crypto.randomUUID());

  const selected = addresses.data?.find((a) => a.id === (addressId || addresses.data?.[0]?.id));
  const total = cart.subtotal + (selected?.deliveryFee ?? 0);

  const place = useMutation({
    mutationFn: () =>
      post<Order>('/orders', {
        clientRequestId: requestId,
        storeId: cart.storeId,
        addressId: selected?.id,
        items: cart.lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: (order) => {
      cart.clear();
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      navigate(`/orders/${order.id}`, { replace: true });
    },
  });

  if (cart.count === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="السلة فاضية"
        text="اختار محل وضيف اللي نفسك فيه"
        action={
          <Link to="/">
            <Button>تصفّح المحلات</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="pb-28 lg:pb-0">
      <h1 className="mb-1 text-2xl font-bold">السلة</h1>
      <p className="mb-5 text-sm text-ink-500">
        من{' '}
        <Link to={`/stores/${cart.storeId}`} className="font-semibold text-brand-700">
          {cart.storeName}
        </Link>
      </p>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="space-y-5">
          <Card padded={false} className="divide-y divide-ink-100">
            {cart.lines.map((l) => (
              <div key={l.product.id} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{l.product.name}</div>
                  <Money value={l.product.price * l.quantity} className="text-sm text-ink-500" />
                </div>
                <Stepper value={l.quantity} onChange={(n) => cart.setQuantity(l.product.id, n)} />
              </div>
            ))}
          </Card>

          <Card>
            <SectionTitle
              icon={MapPin}
              action={
                <Button size="sm" variant="soft" icon={Plus} onClick={() => setAdding(true)}>
                  عنوان جديد
                </Button>
              }
            >
              التوصيل على
            </SectionTitle>
            {addresses.isPending && <SkeletonList count={2} className="h-16" />}
            {addresses.data?.length === 0 && (
              <button
                onClick={() => setAdding(true)}
                className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ink-200 p-6 text-ink-500 hover:border-brand-300 hover:text-brand-700"
              >
                <MapPinned className="size-7" />
                ضيف عنوانك عشان نعرف نوصلك
              </button>
            )}
            <div className="space-y-2" role="radiogroup" aria-label="العنوان">
              {addresses.data?.map((a) => {
                const active = selected?.id === a.id;
                return (
                  <button
                    key={a.id}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setAddressId(a.id)}
                    className={cx(
                      'flex w-full cursor-pointer items-start gap-3 rounded-2xl p-3.5 text-start ring-1 transition',
                      active
                        ? 'bg-brand-50/60 ring-2 ring-brand-500'
                        : 'ring-ink-200 hover:bg-ink-50',
                    )}
                  >
                    <span
                      className={cx(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2',
                        active ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-300',
                      )}
                    >
                      {active && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{a.label}</span>
                        <span className="text-xs text-ink-500">توصيل {money(a.deliveryFee)}</span>
                      </span>
                      <span className="block text-sm text-ink-500">
                        {a.zoneName} — {a.details}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <SectionTitle icon={StickyNote}>ملاحظة للمحل</SectionTitle>
            <Textarea
              placeholder="مثلاً: من غير بصل، أو اتصل قبل ما توصل"
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              aria-label="ملاحظة للمحل"
            />
          </Card>

          <Card>
            <SectionTitle icon={Wallet}>طريقة الدفع</SectionTitle>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-2xl bg-brand-50/60 p-3.5 ring-2 ring-brand-500">
                <Banknote className="size-6 text-brand-600" />
                <div>
                  <div className="font-semibold">كاش عند الاستلام</div>
                  <div className="text-xs text-ink-500">ادفع للطيار لما يوصلك</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-2xl p-3.5 text-ink-400 ring-1 ring-ink-200">
                <Wallet className="size-6" />
                <div>
                  <div className="font-semibold">المحافظ الإلكترونية</div>
                  <div className="text-xs">قريباً</div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-24">
          <h2 className="mb-4 font-bold">ملخص الطلب</h2>
          <dl className="tabular space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-500">المنتجات</dt>
              <dd>
                <Money value={cart.subtotal} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-500">التوصيل</dt>
              <dd>{selected ? <Money value={selected.deliveryFee} /> : '—'}</dd>
            </div>
            <div className="flex justify-between border-t border-dashed border-ink-200 pt-3 text-base font-bold">
              <dt>الإجمالي</dt>
              <dd>
                <Money value={total} />
              </dd>
            </div>
          </dl>
          {place.error && (
            <div className="mt-4">
              <ErrorBox error={place.error} />
            </div>
          )}
          <Button
            size="lg"
            block
            className="mt-5 hidden lg:flex"
            disabled={!selected}
            loading={place.isPending}
            onClick={() => place.mutate()}
          >
            تأكيد الطلب
          </Button>
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-20 border-t border-ink-200/70 bg-white/95 px-4 py-3 backdrop-blur md:bottom-0 lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-4">
          <div className="leading-tight">
            <div className="text-xs text-ink-500">الإجمالي</div>
            <Money value={total} className="text-lg font-bold" />
          </div>
          <Button
            size="lg"
            className="flex-1"
            disabled={!selected}
            loading={place.isPending}
            onClick={() => place.mutate()}
          >
            تأكيد الطلب
          </Button>
        </div>
      </div>

      <AddAddressModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(id) => setAddressId(id)}
      />
    </div>
  );
}

function AddAddressModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const [zoneId, setZoneId] = useState('');
  const [label, setLabel] = useState('البيت');
  const [details, setDetails] = useState('');
  const queryClient = useQueryClient();
  const zones = useQuery({
    queryKey: ['catalog', 'zones'],
    queryFn: () => get<Zone[]>('/catalog/zones'),
    enabled: open,
  });
  const add = useMutation({
    mutationFn: () => post<{ id: string }>('/me/addresses', { label, zoneId, details }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: ['addresses'] });
      onAdded(res.id);
      onClose();
      setDetails('');
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate();
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="عنوان جديد"
      description="اكتب العنوان بالتفصيل عشان الطيار يوصلك بسرعة"
      icon={MapPinned}
    >
      <form onSubmit={submit} className="space-y-4">
        <Select label="المنطقة" value={zoneId} onChange={(e) => setZoneId(e.target.value)} required>
          <option value="">اختار المنطقة</option>
          {zones.data?.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name} — توصيل {money(z.deliveryFee)}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          {['البيت', 'الشغل', 'عند أهلي'].map((l) => (
            <button
              type="button"
              key={l}
              onClick={() => setLabel(l)}
              className={cx(
                'cursor-pointer rounded-full px-3.5 py-1.5 text-sm transition',
                label === l ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <Input
          label="اسم العنوان"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          required
        />
        <Textarea
          label="العنوان بالتفصيل"
          placeholder="الشارع، رقم العمارة، الدور، الشقة، وأي علامة مميزة"
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          minLength={5}
          maxLength={300}
          required
        />
        {add.error && <ErrorBox error={add.error} />}
        <Button type="submit" size="lg" block loading={add.isPending}>
          حفظ العنوان
        </Button>
      </form>
    </Modal>
  );
}
