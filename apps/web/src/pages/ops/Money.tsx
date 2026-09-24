import { STORE_TYPE_LABELS, type StoreType } from '@dm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../components/toast';
import { Button, Card, Empty, ErrorBox, Loading, PageTitle } from '../../components/ui';
import { get, post } from '../../lib/api';
import { dateTime, money, time, toPiasters } from '../../lib/format';

interface CashDiff {
  orderId: string;
  number: number;
  total: number;
  cashCollected: number;
  driverName: string;
  deliveredAt: string;
}
interface StoreBalance {
  id: string;
  name: string;
  type: StoreType;
  payable: number;
}
interface Settlement {
  id: string;
  driverName: string;
  expectedAmount: number;
  receivedAmount: number;
  shortage: number;
  createdAt: string;
}

export default function Money() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const diffs = useQuery({
    queryKey: ['finance', 'diffs'],
    queryFn: () => get<CashDiff[]>('/ops/finance/cash-differences'),
  });
  const stores = useQuery({
    queryKey: ['finance', 'stores'],
    queryFn: () => get<StoreBalance[]>('/ops/finance/stores'),
  });
  const settlements = useQuery({
    queryKey: ['finance', 'settlements'],
    queryFn: () => get<Settlement[]>('/ops/finance/settlements'),
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['finance'] });

  const resolve = useMutation({
    mutationFn: (v: { orderId: string; decision: 'write_off' | 'charge_driver' }) =>
      post(`/ops/finance/cash-differences/${v.orderId}/resolve`, { decision: v.decision }),
    onSuccess: refresh,
    onError: (e) => toast(e.message, 'error'),
  });
  const payout = useMutation({
    mutationFn: (v: { storeId: string; amount: number }) =>
      post(`/ops/finance/stores/${v.storeId}/payout`, { amount: v.amount }),
    onSuccess: () => {
      toast('اتسجل الصرف ✅');
      refresh();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  return (
    <div className="space-y-6">
      <section>
        <PageTitle>⚠️ فروقات التحصيل</PageTitle>
        {diffs.isPending ? (
          <Loading />
        ) : diffs.error ? (
          <ErrorBox error={diffs.error} />
        ) : diffs.data.length === 0 ? (
          <Empty icon="✅" text="مفيش فروقات" />
        ) : (
          <div className="space-y-2">
            {diffs.data.map((d) => (
              <Card key={d.orderId} className="tabular flex flex-wrap items-center gap-3">
                <div className="flex-1 text-sm">
                  طلب #{d.number} · {d.driverName} · {time(d.deliveredAt)}
                  <div>
                    المطلوب {money(d.total)} · اتحصّل {money(d.cashCollected)} ·{' '}
                    <b className="text-red-600">الفرق {money(d.total - d.cashCollected)}</b>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => resolve.mutate({ orderId: d.orderId, decision: 'charge_driver' })}
                >
                  على الطيار
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    confirm('شطب الفرق كخسارة على الشركة؟') &&
                    resolve.mutate({ orderId: d.orderId, decision: 'write_off' })
                  }
                >
                  شطب
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <PageTitle>🏪 مستحقات المحلات</PageTitle>
        {stores.isPending ? (
          <Loading />
        ) : stores.error ? (
          <ErrorBox error={stores.error} />
        ) : (
          <div className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
            {stores.data.map((s) => (
              <div key={s.id} className="tabular flex items-center gap-3 p-3">
                <div className="flex-1">
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-slate-500">{STORE_TYPE_LABELS[s.type]}</div>
                </div>
                <b>{money(s.payable)}</b>
                <Button
                  variant="secondary"
                  disabled={s.payable <= 0}
                  onClick={() => {
                    const input = prompt(
                      `المبلغ المصروف لـ ${s.name} بالجنيه:`,
                      String(s.payable / 100),
                    );
                    const amount = input ? toPiasters(input) : NaN;
                    if (Number.isInteger(amount) && amount > 0)
                      payout.mutate({ storeId: s.id, amount });
                  }}
                >
                  صرف
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <PageTitle>🧾 تسويات النهارده</PageTitle>
        {settlements.data?.length === 0 && <Empty text="مفيش تسويات النهارده لسه" />}
        <div className="space-y-2">
          {settlements.data?.map((s) => (
            <Card key={s.id} className="tabular text-sm">
              <b>{s.driverName}</b> · {dateTime(s.createdAt)}
              <div>
                المفروض {money(s.expectedAmount)} · استلمنا {money(s.receivedAmount)}
                {s.shortage > 0 && <b className="text-red-600"> · عجز {money(s.shortage)}</b>}
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
