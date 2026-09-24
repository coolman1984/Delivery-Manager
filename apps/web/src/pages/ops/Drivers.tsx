import { DRIVER_STATUS_LABELS } from '@dm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, HandCoins, Phone, Wallet } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/dialog';
import { useToast } from '../../components/toast';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Input,
  Kpi,
  Money,
  PageHeader,
  SkeletonList,
} from '../../components/ui';
import { get, post } from '../../lib/api';
import { ago, money, num, toPiasters } from '../../lib/format';
import type { DriverOverview } from '../../lib/types';

const STATUS_TONE = { available: 'success', busy: 'warning', offline: 'neutral' } as const;

export default function Drivers() {
  const drivers = useQuery({
    queryKey: ['finance', 'drivers'],
    queryFn: () => get<DriverOverview[]>('/ops/finance/drivers'),
    refetchInterval: 30_000,
  });
  const [settling, setSettling] = useState<DriverOverview | null>(null);

  const list = drivers.data ?? [];
  const totalCash = list.reduce((s, d) => s + d.cashBalance, 0);
  const online = list.filter((d) => d.status !== 'offline').length;

  return (
    <div>
      <PageHeader
        title="الطيارين والعهدة"
        subtitle="العهدة = الفلوس اللي الطيار حصّلها ولسه ماسلّمهاش. اعمل تسوية لكل طيار آخر اليوم."
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          icon={Bike}
          tone="success"
          label="شغالين دلوقتي"
          value={`${num(online)} من ${num(list.length)}`}
        />
        <Kpi icon={Wallet} tone="warning" label="إجمالي العهدة برّه" value={money(totalCash)} />
      </div>
      {drivers.isPending && <SkeletonList count={3} className="h-32 rounded-3xl" />}
      {drivers.error && <ErrorBox error={drivers.error} />}
      {drivers.data?.length === 0 && (
        <EmptyState icon={Bike} title="مفيش طيارين" text="ضيف طيارين من لوحة الإدارة" />
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {list.map((d) => (
          <Card key={d.id} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar name={d.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{d.name}</div>
                <div className="text-xs text-ink-500">آخر ظهور {ago(d.lastSeenAt)}</div>
              </div>
              <Badge tone={STATUS_TONE[d.status]} dot>
                {DRIVER_STATUS_LABELS[d.status]}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-2xl bg-ink-50 p-3">
                <div className="text-xs text-ink-500">طلبات شغالة</div>
                <div className="tabular font-bold">{num(d.activeOrders)}</div>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3">
                <div className="text-xs text-amber-800">العهدة</div>
                <Money value={d.cashBalance} className="font-bold text-amber-900" />
              </div>
            </div>
            <div className="mt-auto flex gap-2">
              <Button
                variant="primary"
                icon={HandCoins}
                className="flex-1"
                disabled={d.cashBalance <= 0}
                onClick={() => setSettling(d)}
              >
                استلام وتسوية
              </Button>
              <a href={`tel:${d.phone}`}>
                <Button variant="secondary" icon={Phone} aria-label={`اتصل بـ ${d.name}`} />
              </a>
            </div>
          </Card>
        ))}
      </div>
      {settling && <SettleModal driver={settling} onClose={() => setSettling(null)} />}
    </div>
  );
}

function SettleModal({ driver, onClose }: { driver: DriverOverview; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState(String(driver.cashBalance / 100));
  const value = toPiasters(amount);
  const valid = Number.isInteger(value) && value <= driver.cashBalance;
  const shortage = valid ? driver.cashBalance - value : 0;

  const settle = useMutation({
    mutationFn: () =>
      post<{ shortage: number }>(`/ops/finance/drivers/${driver.id}/settle`, {
        receivedAmount: value,
      }),
    onSuccess: (res) => {
      toast(
        res.shortage > 0
          ? `اتسجلت التسوية، وفاضل عليه ${money(res.shortage)}`
          : 'اتسجلت التسوية والعهدة اتقفلت',
      );
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
      onClose();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (valid) settle.mutate();
  }

  return (
    <Modal open onClose={onClose} title={`تسوية عهدة ${driver.name}`} icon={HandCoins}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center justify-between rounded-2xl bg-ink-50 p-4">
          <span className="text-sm text-ink-600">المفروض يسلّم</span>
          <Money value={driver.cashBalance} className="text-xl font-bold" />
        </div>
        <Input
          label="المبلغ اللي استلمته فعلاً"
          suffix="ج.م"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          dir="ltr"
          className="tabular h-14 text-center text-xl font-bold"
          error={Number.isInteger(value) && !valid ? 'أكبر من العهدة' : undefined}
        />
        {shortage > 0 && (
          <div className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-800">
            هيفضل عجز{' '}
            <b>
              <Money value={shortage} />
            </b>{' '}
            متسجل على الطيار لحد ما يسدده.
          </div>
        )}
        <Button type="submit" size="lg" block disabled={!valid} loading={settle.isPending}>
          تأكيد الاستلام
        </Button>
      </form>
    </Modal>
  );
}
