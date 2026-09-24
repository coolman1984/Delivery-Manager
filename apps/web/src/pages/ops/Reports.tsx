import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Bike,
  CircleX,
  Clock,
  Download,
  MapPin,
  ShoppingBag,
  Store,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '../../components/toast';
import {
  Button,
  Card,
  cx,
  ErrorBox,
  Kpi,
  Money,
  PageHeader,
  SectionTitle,
  Segmented,
  SkeletonList,
} from '../../components/ui';
import { getAccessToken } from '../../lib/api';
import { get } from '../../lib/api';
import { money, num, orderNo } from '../../lib/format';
import { getTenantSlug } from '../../lib/tenant';

interface Report {
  totals: {
    orders: number;
    delivered: number;
    cancelled: number;
    rejected: number;
    errands: number;
    sales: number;
    commission: number;
    delivery_fees: number;
    discounts: number;
    net_revenue: number;
    avg_minutes: number;
    late: number;
    customers: number;
  };
  series: Array<{
    date: string;
    orders: number;
    delivered: number;
    revenue: number;
    sales: number;
  }>;
  zones: Array<{ name: string; orders: number; delivered: number; sales: number }>;
  stores: Array<{
    name: string;
    orders: number;
    delivered: number;
    rejected: number;
    sales: number;
    commission: number;
    avg_prep_minutes: number;
    rating: number | null;
  }>;
  drivers: Array<{
    name: string;
    deliveries: number;
    avg_trip_minutes: number;
    collected: number;
    rating: number | null;
    shortages: number;
  }>;
  cancellations: Array<{ status: string; reason: string; count: number }>;
  late: Array<{ number: number; store: string; minutes: number; status: string }>;
}

type Preset = 'today' | '7d' | 'month' | 'last-month';

function cairoDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
}

function rangeFor(p: Preset): { from: string; to: string } {
  const now = new Date();
  const today = cairoDate(now);
  if (p === 'today') return { from: today, to: today };
  if (p === '7d') return { from: cairoDate(new Date(now.getTime() - 6 * 86_400_000)), to: today };
  const [y, m] = today.split('-').map(Number) as [number, number];
  if (p === 'month') return { from: `${y}-${String(m).padStart(2, '0')}-01`, to: today };
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
  const mm = String(prevM).padStart(2, '0');
  return { from: `${prevY}-${mm}-01`, to: `${prevY}-${mm}-${last}` };
}

export default function Reports() {
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>('7d');
  const range = rangeFor(preset);
  const report = useQuery({
    queryKey: ['reports', range.from, range.to],
    queryFn: () => get<Report>(`/ops/reports?from=${range.from}&to=${range.to}`),
  });

  async function exportCsv() {
    try {
      const res = await fetch(`/api/v1/ops/reports/export?from=${range.from}&to=${range.to}`, {
        headers: { authorization: `Bearer ${getAccessToken() ?? ''}`, 'x-tenant': getTenantSlug() },
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `orders-${range.from}-${range.to}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast('التصدير فشل، جرّب تاني', 'error');
    }
  }

  const r = report.data;
  const t = r?.totals;
  return (
    <div>
      <PageHeader
        title="التقارير"
        subtitle={`من ${range.from} لـ ${range.to} (بتوقيت القاهرة)`}
        actions={
          <Button variant="secondary" icon={Download} onClick={() => void exportCsv()}>
            تصدير للإكسل
          </Button>
        }
      />
      <Segmented
        className="mb-6"
        value={preset}
        onChange={setPreset}
        options={[
          { value: 'today', label: 'النهارده' },
          { value: '7d', label: 'آخر ٧ أيام' },
          { value: 'month', label: 'الشهر ده' },
          { value: 'last-month', label: 'الشهر اللي فات' },
        ]}
      />
      {report.isPending && <SkeletonList count={4} className="h-28 rounded-3xl" />}
      {report.error && <ErrorBox error={report.error} />}
      {r && t && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={TrendingUp}
              tone="success"
              label="صافي الأرباح"
              value={money(t.net_revenue)}
              hint="عمولة + توصيل − خصومات"
            />
            <Kpi
              icon={ShoppingBag}
              tone="brand"
              label="الطلبات"
              value={num(t.orders)}
              hint={`${num(t.delivered)} اتسلّم · ${num(t.errands)} مشوار`}
            />
            <Kpi
              icon={Clock}
              tone={t.late ? 'warning' : 'neutral'}
              label="متوسط وقت التوصيل"
              value={`${num(Math.round(t.avg_minutes))} دقيقة`}
              hint={`${num(t.late)} طلب اتأخر +ساعة`}
            />
            <Kpi
              icon={CircleX}
              tone={t.cancelled + t.rejected ? 'danger' : 'neutral'}
              label="ملغي ومرفوض"
              value={num(t.cancelled + t.rejected)}
              hint={
                t.orders
                  ? `${num(Math.round(((t.cancelled + t.rejected) / t.orders) * 100))}٪ من الطلبات`
                  : undefined
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="مبيعات المحلات" value={money(t.sales)} />
            <MiniStat label="العمولة" value={money(t.commission)} />
            <MiniStat label="رسوم التوصيل" value={money(t.delivery_fees)} />
            <MiniStat label="الخصومات والنقاط" value={money(t.discounts)} />
          </div>

          <Card>
            <SectionTitle icon={BarChart3}>صافي الأرباح كل يوم</SectionTitle>
            <RevenueChart series={r.series} />
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Table
              title="أكتر المناطق طلباً"
              icon={MapPin}
              head={['المنطقة', 'الطلبات', 'اتسلّم', 'المبيعات']}
              rows={r.zones.map((z) => [z.name, num(z.orders), num(z.delivered), money(z.sales)])}
            />
            <Table
              title="الطيارين"
              icon={Bike}
              head={['الطيار', 'وصّل', 'متوسط المشوار', 'التقييم', 'عجز']}
              rows={r.drivers.map((d) => [
                d.name,
                num(d.deliveries),
                `${num(Math.round(d.avg_trip_minutes))} د`,
                d.rating ? `${num(d.rating)} ★` : '—',
                d.shortages ? money(d.shortages) : '—',
              ])}
            />
          </div>

          <Table
            title="المحلات"
            icon={Store}
            head={[
              'المحل',
              'الطلبات',
              'اتسلّم',
              'رفض',
              'المبيعات',
              'العمولة',
              'وقت التحضير',
              'التقييم',
            ]}
            rows={r.stores.map((s) => [
              s.name,
              num(s.orders),
              num(s.delivered),
              num(s.rejected),
              money(s.sales),
              money(s.commission),
              `${num(Math.round(s.avg_prep_minutes))} د`,
              s.rating ? `${num(s.rating)} ★` : '—',
            ])}
          />

          <div className="grid gap-6 xl:grid-cols-2">
            <Table
              title="أسباب الإلغاء والرفض"
              icon={CircleX}
              head={['النوع', 'السبب', 'العدد']}
              rows={r.cancellations.map((c) => [
                c.status === 'rejected' ? 'رفض المحل' : 'إلغاء',
                c.reason,
                num(c.count),
              ])}
            />
            <Table
              title="الطلبات المتأخرة (+ساعة)"
              icon={Clock}
              head={['الطلب', 'المحل', 'الوقت']}
              rows={r.late.map((l) => [orderNo(l.number), l.store, `${num(l.minutes)} دقيقة`])}
            />
          </div>
          <p className="flex items-center gap-2 text-sm text-ink-500">
            <Users className="size-4" /> {num(t.customers)} عميل طلبوا في الفترة دي
          </p>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 ring-1 ring-ink-200/60">
      <div className="text-xs text-ink-500">{label}</div>
      <div className="tabular font-bold">{value}</div>
    </div>
  );
}

function Table({
  title,
  icon,
  head,
  rows,
}: {
  title: string;
  icon: typeof MapPin;
  head: string[];
  rows: string[][];
}) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-4">
        <SectionTitle icon={icon}>{title}</SectionTitle>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-6 text-sm text-ink-500">مفيش بيانات في الفترة دي</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="tabular w-full min-w-max text-sm">
            <thead>
              <tr className="border-y border-ink-100 bg-ink-50 text-ink-500">
                {head.map((h) => (
                  <th key={h} className="px-5 py-2.5 text-start font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} className={cx('px-5 py-3', j === 0 && 'font-medium text-ink-900')}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** أعمدة الأرباح اليومية: عمود لكل يوم، وتفاصيل اليوم لما تقف عليه */
function RevenueChart({ series }: { series: Report['series'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = useMemo(() => series, [series]);
  if (data.length === 0)
    return <p className="py-10 text-center text-sm text-ink-500">مفيش طلبات في الفترة دي</p>;

  const max = Math.max(...data.map((d) => d.revenue), 1);
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const W = 720;
  const H = 240;
  const pad = { l: 64, r: 12, t: 24, b: 28 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const band = plotW / data.length;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => pad.t + plotH - (v / top) * plotH;
  const peak = data.reduce((a, b) => (b.revenue > a.revenue ? b : a));

  return (
    <div className="relative" dir="ltr">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="صافي الأرباح اليومية"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-ink-200)"
              strokeWidth={1}
            />
            <text
              x={pad.l - 8}
              y={y(v) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--color-ink-500)"
            >
              {(v / 100).toLocaleString('ar-EG')}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + band * i + (band - barW) / 2;
          const h = Math.max(0, pad.t + plotH - y(d.revenue));
          const r = Math.min(4, h / 2);
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${pad.t + plotH} V${pad.t + plotH - h + r} Q${x},${pad.t + plotH - h} ${x + r},${pad.t + plotH - h} H${x + barW - r} Q${x + barW},${pad.t + plotH - h} ${x + barW},${pad.t + plotH - h + r} V${pad.t + plotH} Z`}
                  fill={hover === i ? 'var(--color-brand-700)' : 'var(--color-brand-600)'}
                />
              )}
              {(data.length <= 10 || i % Math.ceil(data.length / 10) === 0) && (
                <text
                  x={pad.l + band * i + band / 2}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-ink-500)"
                >
                  {Number(d.date.slice(8)).toLocaleString('ar-EG')}/
                  {Number(d.date.slice(5, 7)).toLocaleString('ar-EG')}
                </text>
              )}
              {d === peak && d.revenue > 0 && (
                <text
                  x={pad.l + band * i + band / 2}
                  y={y(d.revenue) - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--color-ink-800)"
                >
                  {(d.revenue / 100).toLocaleString('ar-EG')}
                </text>
              )}
            </g>
          );
        })}
        <line
          x1={pad.l}
          x2={W - pad.r}
          y1={pad.t + plotH}
          y2={pad.t + plotH}
          stroke="var(--color-ink-300)"
          strokeWidth={1}
        />
      </svg>
      {hover !== null && data[hover] && (
        <div
          dir="rtl"
          className="pointer-events-none absolute top-0 rounded-xl bg-ink-900 px-3 py-2 text-xs text-white shadow-lift"
          style={{
            left: `${((pad.l + band * hover + band / 2) / W) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-semibold">{data[hover]!.date}</div>
          <div>
            صافي الأرباح: <Money value={data[hover]!.revenue} />
          </div>
          <div>
            الطلبات: {num(data[hover]!.orders)} · اتسلّم {num(data[hover]!.delivered)}
          </div>
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}
