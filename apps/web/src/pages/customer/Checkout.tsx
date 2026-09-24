import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Empty, ErrorBox, Input, Loading, Select } from '../../components/ui';
import { get, post } from '../../lib/api';
import { useCart } from '../../lib/cart';
import { money } from '../../lib/format';
import type { Address, Order, Zone } from '../../lib/types';
import { QtyButton } from './StorePage';

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
  // رقم ثابت لمحاولة الطلب دي: لو النت فصل وضغط تاني، الطلب مايتكررش
  const [requestId] = useState(() => crypto.randomUUID());

  const selected = addresses.data?.find((a) => a.id === (addressId || addresses.data?.[0]?.id));

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

  if (cart.count === 0) return <Empty icon="🛒" text="السلة فاضية" />;
  if (addresses.isPending) return <Loading />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">طلبك من {cart.storeName}</h1>
      <Card className="divide-y divide-slate-100 p-0">
        {cart.lines.map((l) => (
          <div key={l.product.id} className="flex items-center gap-3 p-3">
            <div className="flex-1">
              <div className="font-medium">{l.product.name}</div>
              <div className="tabular text-sm text-slate-500">
                {money(l.product.price * l.quantity)}
              </div>
            </div>
            <QtyButton onClick={() => cart.setQuantity(l.product.id, l.quantity - 1)}>−</QtyButton>
            <span className="tabular w-5 text-center font-semibold">{l.quantity}</span>
            <QtyButton onClick={() => cart.setQuantity(l.product.id, l.quantity + 1)}>+</QtyButton>
          </div>
        ))}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold">📍 التوصيل على</h2>
        {addresses.data && addresses.data.length > 0 ? (
          <Select
            label="العنوان"
            value={selected?.id ?? ''}
            onChange={(e) => setAddressId(e.target.value)}
          >
            {addresses.data.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} — {a.zoneName}: {a.details}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm text-slate-500">ضيف عنوان الأول</p>
        )}
        <NewAddress onAdded={(id) => setAddressId(id)} />
        <Input
          label="ملاحظة للمحل (اختياري)"
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
        />
      </Card>

      <Card className="tabular space-y-1 text-sm">
        <Row label="المنتجات" value={money(cart.subtotal)} />
        <Row label="التوصيل" value={selected ? money(selected.deliveryFee) : '—'} />
        <div className="border-t border-slate-100 pt-2 text-base font-bold">
          <Row
            label="الإجمالي"
            value={selected ? money(cart.subtotal + selected.deliveryFee) : '—'}
          />
        </div>
        <p className="pt-1 text-xs text-slate-500">
          💵 الدفع كاش عند الاستلام. السعر النهائي بيتأكد من المحل وقت الطلب.
        </p>
      </Card>

      {place.error && <ErrorBox error={place.error} />}
      <Button
        className="w-full"
        disabled={!selected}
        loading={place.isPending}
        onClick={() => place.mutate()}
      >
        تأكيد الطلب
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function NewAddress({ onAdded }: { onAdded: (id: string) => void }) {
  const [open, setOpen] = useState(false);
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
      setOpen(false);
      setDetails('');
    },
  });

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        + عنوان جديد
      </Button>
    );
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    add.mutate();
  }
  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl bg-slate-50 p-3">
      <Select label="المنطقة" value={zoneId} onChange={(e) => setZoneId(e.target.value)} required>
        <option value="">اختار المنطقة</option>
        {zones.data?.map((z) => (
          <option key={z.id} value={z.id}>
            {z.name} (توصيل {money(z.deliveryFee)})
          </option>
        ))}
      </Select>
      <Input
        label="اسم العنوان"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={40}
        required
      />
      <Input
        label="العنوان بالتفصيل"
        placeholder="الشارع، رقم العمارة، الدور، علامة مميزة"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        minLength={5}
        maxLength={300}
        required
      />
      {add.error && <ErrorBox error={add.error} />}
      <div className="flex gap-2">
        <Button type="submit" loading={add.isPending}>
          حفظ العنوان
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
