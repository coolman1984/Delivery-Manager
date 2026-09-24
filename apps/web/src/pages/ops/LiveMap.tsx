import { ACTIVE_ORDER_STATUSES, DRIVER_STATUS_LABELS } from '@dm/shared';
import { useQuery } from '@tanstack/react-query';
import { Bike, MapPinned } from 'lucide-react';
import { useMemo } from 'react';
import { LazyMap, type MapMarker } from '../../components/LazyMap';
import { Badge, Card, cx, PageHeader } from '../../components/ui';
import { get } from '../../lib/api';
import { ago, num, orderNo } from '../../lib/format';
import type { DriverOverview, Order } from '../../lib/types';

/** الخريطة المباشرة: كل الطيارين والطلبات الشغالة قدام مدير التشغيل */
export default function LiveMap() {
  const drivers = useQuery({
    queryKey: ['finance', 'drivers'],
    queryFn: () => get<DriverOverview[]>('/ops/finance/drivers'),
    refetchInterval: 15_000,
  });
  const orders = useQuery({
    queryKey: ['orders', 'ops', 'active'],
    queryFn: () => get<Order[]>(`/orders?status=${ACTIVE_ORDER_STATUSES.join(',')}`),
    refetchInterval: 30_000,
  });

  const markers = useMemo(() => {
    const list: MapMarker[] = [];
    for (const d of drivers.data ?? []) {
      // مكان الطيار بيظهر بس وهو شغال (خصوصيته بعد الشغل)
      if (d.status === 'offline' || d.lastLat == null || d.lastLng == null) continue;
      list.push({
        id: `d-${d.id}`,
        lat: d.lastLat,
        lng: d.lastLng,
        kind:
          d.status === 'available' ? 'driver' : d.status === 'busy' ? 'driver-busy' : 'driver-off',
        label: d.name,
      });
    }
    for (const o of orders.data ?? []) {
      const lat = o.type === 'errand' ? o.pickupLat : o.storeLat;
      const lng = o.type === 'errand' ? o.pickupLng : o.storeLng;
      if (lat != null && lng != null) {
        list.push({
          id: `o-${o.id}`,
          lat,
          lng,
          kind: o.type === 'errand' ? 'pickup' : 'store',
          label: orderNo(o.number),
        });
      }
    }
    return list;
  }, [drivers.data, orders.data]);

  const online = drivers.data?.filter((d) => d.status !== 'offline') ?? [];

  return (
    <div>
      <PageHeader
        title="الخريطة المباشرة"
        subtitle="مكان كل طيار شغال، والطلبات اللي مستنية استلام. بتتحدث لوحدها."
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <LazyMap markers={markers} className="h-[70dvh] min-h-96" />
        <Card padded={false}>
          <div className="flex items-center gap-2 border-b border-ink-100 px-5 py-4 font-bold">
            <Bike className="size-5 text-brand-600" /> الطيارين الشغالين ({num(online.length)})
          </div>
          <div className="max-h-[60dvh] divide-y divide-ink-100 overflow-y-auto">
            {online.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-ink-500">
                <MapPinned className="size-6" /> مفيش طيارين شغالين دلوقتي
              </div>
            )}
            {online.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={cx(
                    'size-2.5 rounded-full',
                    d.status === 'available' ? 'bg-emerald-500' : 'bg-amber-500',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.name}</div>
                  <div className="text-xs text-ink-500">آخر مكان {ago(d.lastSeenAt)}</div>
                </div>
                <Badge tone={d.status === 'available' ? 'success' : 'warning'}>
                  {DRIVER_STATUS_LABELS[d.status]}
                  {d.activeOrders ? ` · ${num(d.activeOrders)}` : ''}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
