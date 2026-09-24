import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  Banknote,
  Building2,
  CircleAlert,
  PauseCircle,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router';
import {
  Card,
  ErrorBox,
  Kpi,
  Money,
  PageHeader,
  SectionTitle,
  SkeletonList,
} from '../../components/ui';
import { money, num } from '../../lib/format';
import { pget, type Overview as OverviewData, type PlatformTenant } from './api';
import { dateOnly, SubscriptionBadge } from './bits';

export default function Overview() {
  const q = useQuery({
    queryKey: ['platform', 'overview'],
    queryFn: () => pget<OverviewData>('/overview'),
  });
  if (q.isPending) return <SkeletonList count={4} />;
  if (q.error) return <ErrorBox error={q.error} />;
  const o = q.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title="نظرة عامة"
        subtitle="الشركات المشتركة، والفلوس اللي داخلة، وحركة الطلبات"
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={Building2}
          tone="brand"
          label="شركات شغالة"
          value={num(o.active)}
          hint={`من ${num(o.tenants)} شركة`}
        />
        <Kpi
          icon={TrendingUp}
          tone="success"
          label="دخل شهري متوقع"
          value={money(o.monthlyRecurring)}
          hint="مجموع باقات الشركات الشغالة"
        />
        <Kpi
          icon={Banknote}
          tone="neutral"
          label="اتحصّل الشهر ده"
          value={money(o.collectedThisMonth)}
        />
        <Kpi
          icon={PauseCircle}
          tone={o.suspended ? 'danger' : 'neutral'}
          label="شركات موقوفة"
          value={num(o.suspended)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Kpi icon={ShoppingBag} label="طلبات كل الشركات (آخر ٣٠ يوم)" value={num(o.orders30d)} />
        <Kpi icon={Banknote} label="مبيعات كل الشركات (آخر ٣٠ يوم)" value={money(o.gmv30d)} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <TenantList
          icon={CircleAlert}
          title="متأخرين في الدفع"
          empty="مفيش حد متأخر 👌"
          rows={o.overdue}
        />
        <TenantList
          icon={AlarmClock}
          title="اشتراكات بتخلص خلال أسبوع"
          empty="مفيش اشتراكات قربت تخلص"
          rows={o.expiringSoon}
        />
      </div>
    </div>
  );
}

function TenantList({
  icon,
  title,
  empty,
  rows,
}: {
  icon: typeof CircleAlert;
  title: string;
  empty: string;
  rows: PlatformTenant[];
}) {
  return (
    <Card className="p-0">
      <div className="p-5 pb-3">
        <SectionTitle icon={icon}>{title}</SectionTitle>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-ink-500">{empty}</p>
      ) : (
        <ul className="divide-y divide-ink-100">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                to={`/platform/tenants?open=${t.id}`}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-ink-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink-900">{t.name}</div>
                  <div className="text-xs text-ink-500">
                    {t.plan?.name ?? '—'} · لحد {dateOnly(t.paidUntil)}
                  </div>
                </div>
                {t.plan && <Money value={t.plan.monthlyPrice} className="text-sm font-semibold" />}
                <SubscriptionBadge tenant={t} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
