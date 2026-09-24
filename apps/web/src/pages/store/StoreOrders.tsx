import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Bike,
  ChefHat,
  CircleX,
  Clock,
  Coffee,
  PackageCheck,
  StickyNote,
} from 'lucide-react';
import { useState } from 'react';
import { useDialog } from '../../components/dialog';
import { useToast } from '../../components/toast';
import {
  Badge,
  Button,
  Card,
  cx,
  EmptyState,
  ErrorBox,
  Money,
  PageHeader,
  Segmented,
  SkeletonList,
  Switch,
} from '../../components/ui';
import { get, patch, post } from '../../lib/api';
import { minutesSince, num, orderNo, time } from '../../lib/format';
import type { Order, OrderDetail } from '../../lib/types';

interface StoreMe {
  id: string;
  name: string;
  isOpen: boolean;
  commissionBps: number;
}

const COLUMNS = [
  { status: 'placed', title: 'طلبات جديدة', icon: Bell, tone: 'text-amber-600 bg-amber-50' },
  { status: 'accepted', title: 'بتتحضّر', icon: ChefHat, tone: 'text-sky-600 bg-sky-50' },
  {
    status: 'ready',
    title: 'جاهزة للطيار',
    icon: PackageCheck,
    tone: 'text-violet-600 bg-violet-50',
  },
] as const;
type Column = (typeof COLUMNS)[number]['status'];

export default function StoreOrders() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Column>('placed');
  const me = useQuery({ queryKey: ['store-me'], queryFn: () => get<StoreMe>('/store/me') });
  const orders = useQuery({
    queryKey: ['orders', 'store'],
    queryFn: () => get<Order[]>('/orders?status=placed,accepted,ready'),
    refetchInterval: 30_000,
  });
  const toggle = useMutation({
    mutationFn: (isOpen: boolean) => patch('/store/me/open', { isOpen }),
    onSuccess: (_, isOpen) => {
      toast(isOpen ? 'المحل مفتوح وبيستقبل طلبات' : 'المحل اتقفل');
      void queryClient.invalidateQueries({ queryKey: ['store-me'] });
    },
  });

  const byStatus = (s: Column) => orders.data?.filter((o) => o.status === s) ?? [];

  return (
    <div>
      <PageHeader
        title={me.data?.name ?? 'الطلبات'}
        subtitle="الطلبات الجديدة بتظهر هنا فوراً مع صوت تنبيه"
        actions={
          me.data && (
            <div
              className={cx(
                'flex items-center gap-3 rounded-2xl px-4 py-2.5 ring-1',
                me.data.isOpen ? 'bg-emerald-50 ring-emerald-200' : 'bg-white ring-ink-200',
              )}
            >
              <span
                className={cx(
                  'size-2.5 rounded-full',
                  me.data.isOpen ? 'animate-pulse bg-emerald-500' : 'bg-ink-300',
                )}
              />
              <span className="text-sm font-semibold">{me.data.isOpen ? 'مفتوح' : 'مقفول'}</span>
              <Switch
                checked={me.data.isOpen}
                onChange={(v) => toggle.mutate(v)}
                disabled={toggle.isPending}
                label="استقبال الطلبات"
              />
            </div>
          )
        }
      />

      {orders.isPending && <SkeletonList count={3} className="h-40 rounded-3xl" />}
      {orders.error && <ErrorBox error={orders.error} />}

      {orders.data && (
        <>
          <Segmented
            className="mb-4 lg:hidden"
            value={tab}
            onChange={setTab}
            options={COLUMNS.map((c) => ({
              value: c.status,
              label: c.title,
              count: byStatus(c.status).length,
            }))}
          />
          <div className="grid gap-5 lg:grid-cols-3">
            {COLUMNS.map((c) => {
              const list = byStatus(c.status);
              return (
                <section key={c.status} className={cx(tab !== c.status && 'hidden lg:block')}>
                  <div className="mb-3 hidden items-center gap-2 lg:flex">
                    <span
                      className={cx('flex size-8 items-center justify-center rounded-xl', c.tone)}
                    >
                      <c.icon className="size-4" />
                    </span>
                    <h2 className="font-bold">{c.title}</h2>
                    <span className="tabular rounded-full bg-ink-100 px-2 text-sm text-ink-600">
                      {num(list.length)}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {list.length === 0 && (
                      <div className="rounded-3xl border-2 border-dashed border-ink-200 py-10 text-center text-sm text-ink-400">
                        <Coffee className="mx-auto mb-2 size-6" /> مفيش حاجة هنا
                      </div>
                    )}
                    {list.map((o) => (
                      <Ticket key={o.id} order={o} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          {orders.data.length === 0 && (
            <EmptyState
              icon={Coffee}
              title="مفيش طلبات دلوقتي"
              text="أول ما يوصل طلب هتسمع صوت تنبيه"
            />
          )}
        </>
      )}
    </div>
  );
}

const REJECT_REASONS = ['منتج خلص', 'المحل زحمة جداً', 'هنقفل حالاً'];

function Ticket({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const dialog = useDialog();
  const detail = useQuery({
    queryKey: ['order', order.id],
    queryFn: () => get<OrderDetail>(`/orders/${order.id}`),
  });
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: object }) =>
      post(`/orders/${order.id}/${path}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['orders'] }),
    onError: (err) => toast(err.message, 'error'),
  });

  async function reject() {
    const reason = await dialog.prompt({
      title: `رفض طلب ${orderNo(order.number)}`,
      description: 'العميل هيشوف السبب، فخليه واضح',
      label: 'سبب الرفض',
      suggestions: REJECT_REASONS,
      minLength: 3,
      confirmLabel: 'رفض الطلب',
      danger: true,
      icon: CircleX,
    });
    if (reason) action.mutate({ path: 'reject', body: { reason } });
  }

  const waiting = minutesSince(order.placedAt);
  const urgent = order.status === 'placed' && waiting >= 3;
  return (
    <Card
      padded={false}
      className={cx('overflow-hidden', order.status === 'placed' && 'ring-2 ring-amber-300')}
    >
      <div className="flex items-center justify-between gap-2 border-b border-dashed border-ink-200 px-5 py-3.5">
        <span className="tabular text-xl font-bold">{orderNo(order.number)}</span>
        <Badge tone={urgent ? 'danger' : 'neutral'}>
          <Clock className="size-3.5" /> {time(order.placedAt)} · من {num(waiting)} د
        </Badge>
      </div>
      <div className="space-y-3 px-5 py-4">
        <ul className="space-y-1.5">
          {detail.data?.items.map((it, i) => (
            <li key={i} className="flex items-center gap-2.5">
              <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-lg bg-ink-900 text-sm font-bold text-white">
                {num(it.quantity)}
              </span>
              <span className="font-medium">{it.name}</span>
            </li>
          ))}
          {detail.isPending && <li className="h-6 w-2/3 animate-pulse rounded bg-ink-100" />}
        </ul>
        {order.note && (
          <div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
            <StickyNote className="mt-0.5 size-4 shrink-0" /> {order.note}
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          <span className="text-ink-500">قيمة المنتجات</span>
          <Money value={order.subtotal} className="font-bold" />
        </div>
        {order.commissionAmount !== null && (
          <div className="flex items-center justify-between text-xs text-ink-500">
            <span>صافي ليك بعد العمولة</span>
            <Money value={order.subtotal - order.commissionAmount} />
          </div>
        )}
        {order.driverName && (
          <div className="flex items-center gap-2 text-sm text-ink-600">
            <Bike className="size-4 text-brand-600" /> الطيار: <b>{order.driverName}</b>
          </div>
        )}
      </div>
      {order.status !== 'ready' && (
        <div className="flex gap-2 bg-ink-50 px-5 py-3.5">
          {order.status === 'placed' && (
            <>
              <Button
                className="flex-1"
                loading={action.isPending}
                onClick={() => action.mutate({ path: 'accept' })}
              >
                قبول الطلب
              </Button>
              <Button variant="secondary" onClick={() => void reject()} disabled={action.isPending}>
                رفض
              </Button>
            </>
          )}
          {order.status === 'accepted' && (
            <Button
              variant="dark"
              icon={PackageCheck}
              className="flex-1"
              loading={action.isPending}
              onClick={() => action.mutate({ path: 'ready' })}
            >
              الطلب جاهز
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
