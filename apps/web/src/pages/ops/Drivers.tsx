import { DRIVER_STATUS_LABELS } from '@dm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '../../components/toast';
import { Button, Card, ErrorBox, Loading, PageTitle } from '../../components/ui';
import { get, post } from '../../lib/api';
import { dateTime, money, toPiasters } from '../../lib/format';
import type { DriverOverview } from '../../lib/types';

const statusDot = {
  available: 'bg-emerald-500',
  busy: 'bg-amber-500',
  offline: 'bg-slate-300',
} as const;

export default function Drivers() {
  const drivers = useQuery({
    queryKey: ['finance', 'drivers'],
    queryFn: () => get<DriverOverview[]>('/ops/finance/drivers'),
    refetchInterval: 30_000,
  });
  if (drivers.isPending) return <Loading />;
  if (drivers.error) return <ErrorBox error={drivers.error} />;
  return (
    <div>
      <PageTitle>الطيارين والعهدة</PageTitle>
      <p className="mb-4 text-sm text-slate-500">
        العهدة = كل الفلوس اللي الطيار حصّلها من العملاء ولسه ماسلّمهاش. آخر اليوم اعمل تسوية لكل
        طيار.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {drivers.data.map((d) => (
          <DriverCard key={d.id} driver={d} />
        ))}
      </div>
    </div>
  );
}

function DriverCard({ driver }: { driver: DriverOverview }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const settle = useMutation({
    mutationFn: (receivedAmount: number) =>
      post<{ shortage: number }>(`/ops/finance/drivers/${driver.id}/settle`, { receivedAmount }),
    onSuccess: (res) => {
      toast(
        res.shortage > 0
          ? `اتسجلت التسوية، وفاضل عليه ${money(res.shortage)}`
          : 'اتسجلت التسوية ✅',
      );
      setAmount('');
      void queryClient.invalidateQueries({ queryKey: ['finance'] });
    },
    onError: (e) => toast(e.message, 'error'),
  });

  function submit() {
    const value = toPiasters(amount);
    if (!Number.isInteger(value)) return toast('المبلغ غلط', 'error');
    if (confirm(`تأكيد استلام ${money(value)} من ${driver.name}؟`)) settle.mutate(value);
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="font-semibold">
          <span className={`me-2 inline-block size-2.5 rounded-full ${statusDot[driver.status]}`} />
          {driver.name}
        </div>
        <span className="text-xs text-slate-500">
          {DRIVER_STATUS_LABELS[driver.status]} · {driver.activeOrders} طلب شغال
        </span>
      </div>
      <div className="mt-1 text-xs text-slate-500">
        <a href={`tel:${driver.phone}`} dir="ltr">
          {driver.phone}
        </a>{' '}
        · آخر ظهور: {dateTime(driver.lastSeenAt)}
      </div>
      <div className="tabular mt-3 rounded-xl bg-amber-50 p-3 text-center">
        العهدة: <b className="text-lg">{money(driver.cashBalance)}</b>
      </div>
      {driver.cashBalance > 0 && (
        <div className="mt-3 flex gap-2">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={String(driver.cashBalance / 100)}
            inputMode="decimal"
            dir="ltr"
            className="tabular min-h-11 w-full flex-1 rounded-xl border border-slate-300 px-3"
            aria-label="المبلغ المستلم بالجنيه"
          />
          <Button loading={settle.isPending} onClick={submit}>
            استلام وتسوية
          </Button>
        </div>
      )}
    </Card>
  );
}
