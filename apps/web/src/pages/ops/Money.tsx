import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CircleCheck, HandCoins, ScrollText, Store, TriangleAlert } from 'lucide-react';
import { useDialog } from '../../components/dialog';
import { useToast } from '../../components/toast';
import {
  Avatar,
  Button,
  Card,
  EmptyState,
  ErrorBox,
  Kpi,
  Money as MoneyText,
  PageHeader,
  SectionTitle,
  SkeletonList,
} from '../../components/ui';
import { get, post } from '../../lib/api';
import { dateTime, money, num, orderNo, time, toPiasters } from '../../lib/format';
import { STORE_VISUAL } from '../../lib/visuals';
import type { StoreType } from '@dm/shared';

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
  const dialog = useDialog();
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
    onSuccess: () => {
      toast('اتحسم الفرق');
      refresh();
    },
    onError: (e) => toast(e.message, 'error'),
  });
  const payout = useMutation({
    mutationFn: (v: { storeId: string; amount: number }) =>
      post(`/ops/finance/stores/${v.storeId}/payout`, { amount: v.amount }),
    onSuccess: () => {
      toast('اتسجل التحويل للمحل');
      refresh();
    },
    onError: (e) => toast(e.message, 'error'),
  });

  const owed = stores.data?.reduce((s, x) => s + x.payable, 0) ?? 0;
  const received = settlements.data?.reduce((s, x) => s + x.receivedAmount, 0) ?? 0;

  async function askPayout(s: StoreBalance) {
    const value = await dialog.prompt({
      title: `تحويل لـ ${s.name}`,
      description: `المستحق: ${money(s.payable)}`,
      label: 'المبلغ المحوّل',
      defaultValue: String(s.payable / 100),
      inputMode: 'decimal',
      icon: Store,
      confirmLabel: 'تسجيل التحويل',
      validate: (v) => {
        const p = toPiasters(v);
        if (!Number.isInteger(p) || p <= 0) return 'اكتب مبلغ صحيح';
        return p > s.payable ? 'أكبر من المستحق' : null;
      },
    });
    if (value) payout.mutate({ storeId: s.id, amount: toPiasters(value) });
  }

  return (
    <div>
      <PageHeader
        title="الفلوس"
        subtitle="كل جنيه متسجل: جاي منين ورايح فين، ومحدش يقدر يعدّل فيه"
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          icon={Store}
          tone="brand"
          label="مستحقات المحلات"
          value={money(owed)}
          hint="لسه ماتحوّلتش"
        />
        <Kpi
          icon={HandCoins}
          tone="success"
          label="استلمنا من الطيارين النهارده"
          value={money(received)}
        />
        <Kpi
          icon={TriangleAlert}
          tone={diffs.data?.length ? 'danger' : 'neutral'}
          label="فروقات مستنية قرار"
          value={diffs.data?.length ? num(diffs.data.length) : 'مفيش'}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <SectionTitle icon={TriangleAlert}>فروقات التحصيل</SectionTitle>
          {diffs.isPending && <SkeletonList count={2} className="h-16" />}
          {diffs.error && <ErrorBox error={diffs.error} />}
          {diffs.data?.length === 0 && (
            <EmptyState
              icon={CircleCheck}
              title="مفيش فروقات"
              text="كل الطيارين حصّلوا المبلغ كامل"
            />
          )}
          <div className="space-y-3">
            {diffs.data?.map((d) => (
              <div key={d.orderId} className="rounded-2xl bg-ink-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="font-bold">طلب {orderNo(d.number)}</span>
                  <span className="text-xs text-ink-500">
                    {d.driverName} · {time(d.deliveredAt)}
                  </span>
                </div>
                <div className="tabular mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <div className="text-xs text-ink-500">المطلوب</div>
                    <MoneyText value={d.total} />
                  </div>
                  <div>
                    <div className="text-xs text-ink-500">اتحصّل</div>
                    <MoneyText value={d.cashCollected} />
                  </div>
                  <div>
                    <div className="text-xs text-rose-600">الفرق</div>
                    <MoneyText
                      value={d.total - d.cashCollected}
                      className="font-bold text-rose-700"
                    />
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="dark"
                    className="flex-1"
                    onClick={() =>
                      resolve.mutate({ orderId: d.orderId, decision: 'charge_driver' })
                    }
                  >
                    على الطيار
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onClick={async () => {
                      const ok = await dialog.confirm({
                        title: 'شطب الفرق؟',
                        description: `هيتسجل ${money(d.total - d.cashCollected)} خسارة على الشركة.`,
                        confirmLabel: 'شطب',
                        danger: true,
                      });
                      if (ok) resolve.mutate({ orderId: d.orderId, decision: 'write_off' });
                    }}
                  >
                    شطب على الشركة
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle icon={Store}>مستحقات المحلات</SectionTitle>
          <p className="-mt-1 mb-3 text-sm text-ink-500">
            حق كل محل بعد خصم العمولة. سجّل التحويل هنا أول ما تحوّل له.
          </p>
          {stores.isPending && <SkeletonList count={3} className="h-14" />}
          <div className="divide-y divide-ink-100">
            {stores.data?.map((s) => {
              const v = STORE_VISUAL[s.type];
              return (
                <div key={s.id} className="flex items-center gap-3 py-3">
                  <span className={`flex size-10 items-center justify-center rounded-xl ${v.tile}`}>
                    <v.icon className={`size-5 ${v.iconColor}`} />
                  </span>
                  <span className="flex-1 font-medium">{s.name}</span>
                  <MoneyText value={s.payable} className="font-bold" />
                  <Button
                    size="sm"
                    variant="soft"
                    icon={Banknote}
                    disabled={s.payable <= 0}
                    onClick={() => void askPayout(s)}
                  >
                    تحويل
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <SectionTitle icon={ScrollText}>تسويات النهارده</SectionTitle>
          {settlements.data?.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-500">مفيش تسويات النهارده لسه</p>
          )}
          <div className="divide-y divide-ink-100">
            {settlements.data?.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <Avatar name={s.driverName} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{s.driverName}</div>
                  <div className="text-xs text-ink-500">{dateTime(s.createdAt)}</div>
                </div>
                <div className="tabular text-sm">
                  استلمنا{' '}
                  <b>
                    <MoneyText value={s.receivedAmount} />
                  </b>{' '}
                  من <MoneyText value={s.expectedAmount} />
                </div>
                {s.shortage > 0 ? (
                  <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                    عجز {money(s.shortage)}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    مقفولة
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
