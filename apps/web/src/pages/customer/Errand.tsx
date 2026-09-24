import { useMutation, useQuery } from '@tanstack/react-query';
import { Crosshair, MapPin, Package, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { AddAddressModal } from '../../components/AddressSheet';
import { LazyMap } from '../../components/LazyMap';
import { useToast } from '../../components/toast';
import { Art } from '../../components/visual';
import {
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Input,
  Money,
  SectionTitle,
  Select,
  Textarea,
} from '../../components/ui';
import { get, post } from '../../lib/api';
import { useSelectedAddress, useZones } from '../../lib/address';
import type { Order } from '../../lib/types';

interface Features {
  errandsEnabled: boolean;
  errandExtraFee: number;
}

/** المشوار: الطيار يستلم حاجة من أي مكان ويوصلها لعنوانك */
export default function Errand() {
  const navigate = useNavigate();
  const toast = useToast();
  const features = useQuery({
    queryKey: ['features'],
    queryFn: () => get<Features>('/catalog/features'),
  });
  const { address, addresses, select } = useSelectedAddress();
  const zones = useZones();
  const firstZone = zones.data?.find((z) => z.centerLat != null);
  const zoneCenter = firstZone
    ? { lat: firstZone.centerLat!, lng: firstZone.centerLng! }
    : undefined;
  const [pickupText, setPickupText] = useState('');
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [details, setDetails] = useState('');
  const [adding, setAdding] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());

  const fee = address && features.data ? address.deliveryFee + features.data.errandExtraFee : null;
  const send = useMutation({
    mutationFn: () =>
      post<Order>('/orders/errands', {
        clientRequestId: requestId,
        pickupText,
        ...(pickup ? { pickupLat: pickup.lat, pickupLng: pickup.lng } : {}),
        addressId: address?.id,
        details,
      }),
    onSuccess: (o) => navigate(`/orders/${o.id}`, { replace: true }),
  });

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setPickup({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast('مقدرناش نحدد المكان، دوس على الخريطة', 'error'),
    );
  }

  if (features.data && !features.data.errandsEnabled) {
    return (
      <EmptyState
        icon={Package}
        art="package"
        title="المشاوير مش متاحة دلوقتي"
        text="هترجع قريب إن شاء الله"
      />
    );
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    send.mutate();
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-5 pb-10">
      <div className="relative overflow-hidden rounded-3xl bg-violet-600 p-6 text-white">
        <div className="absolute -bottom-12 -left-10 size-44 rounded-full bg-white/15" />
        <Art name="package" className="absolute bottom-3 left-4 size-24" />
        <div className="relative max-w-[65%]">
          <h1 className="text-2xl font-bold">مشوار</h1>
          <p className="mt-1 text-sm text-violet-100">
            الطيار يستلم أي حاجة من أي مكان ويوصلها لحد عندك: روشتة، مفاتيح، ورق، هدية...
          </p>
        </div>
      </div>

      <Card className="space-y-4">
        <SectionTitle icon={Package}>يستلم منين؟</SectionTitle>
        <Input
          label="مكان الاستلام"
          placeholder="مثلاً: صيدلية العزبي، شارع صلاح سالم"
          value={pickupText}
          onChange={(e) => setPickupText(e.target.value)}
          required
          minLength={5}
        />
        <Button type="button" variant="soft" size="sm" icon={Crosshair} onClick={locate}>
          أنا في مكان الاستلام دلوقتي
        </Button>
        <LazyMap
          className="h-48"
          fit={false}
          zoom={15}
          center={pickup ?? zoneCenter}
          markers={pickup ? [{ id: 'pickup', ...pickup, kind: 'pickup' }] : []}
          onPick={setPickup}
        />
        <p className="text-xs text-ink-500">
          حدد مكان الاستلام على الخريطة (اختياري) عشان نختار أقرب طيار
        </p>
        <Textarea
          label="المطلوب إيه؟"
          placeholder="مثلاً: استلام روشتة جاهزة باسم أحمد، ومدفوعة"
          rows={3}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          required
          minLength={3}
          maxLength={500}
        />
      </Card>

      <Card className="space-y-3">
        <SectionTitle
          icon={MapPin}
          action={
            <Button
              type="button"
              size="sm"
              variant="soft"
              icon={Plus}
              onClick={() => setAdding(true)}
            >
              عنوان جديد
            </Button>
          }
        >
          يوصّلها فين؟
        </SectionTitle>
        {addresses.length > 0 ? (
          <Select
            label="العنوان"
            value={address?.id ?? ''}
            onChange={(e) => select(e.target.value)}
          >
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} — {a.zoneName}: {a.details}
              </option>
            ))}
          </Select>
        ) : (
          <p className="text-sm text-ink-500">ضيف عنوانك الأول</p>
        )}
      </Card>

      <Card className="flex items-center justify-between">
        <div>
          <div className="text-sm text-ink-500">سعر المشوار (كاش للطيار)</div>
          {fee !== null ? <Money value={fee} className="text-xl font-bold" /> : <span>—</span>}
        </div>
        <Button type="submit" size="lg" disabled={!address} loading={send.isPending}>
          اطلب المشوار
        </Button>
      </Card>
      {send.error && <ErrorBox error={send.error} />}
      <AddAddressModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(id) => select(id)}
      />
    </form>
  );
}
