import {
  ChevronLeft,
  Handshake,
  KeyRound,
  LogOut,
  MapPin,
  Package,
  Phone,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { AddressSheet } from '../../components/AddressSheet';
import { JoinModal, type JoinType } from '../../components/JoinModal';
import { ChangePasswordModal, useTenant } from '../../components/Shell';
import { Art } from '../../components/visual';
import { PushButton } from '../../components/PushButton';
import { Avatar } from '../../components/ui';
import { useSelectedAddress } from '../../lib/address';
import { useAuth } from '../../lib/auth';
import { dateTime, money, num, orderNo } from '../../lib/format';
import { get } from '../../lib/api';
import { Modal } from '../../components/dialog';
import { useQuery } from '@tanstack/react-query';

interface Row {
  icon: LucideIcon;
  label: string;
  hint?: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
}

export default function Account() {
  const { user, signOut } = useAuth();
  const tenant = useTenant();
  const { addresses } = useSelectedAddress();
  const [changing, setChanging] = useState(false);
  const [addressesOpen, setAddressesOpen] = useState(false);
  const [join, setJoin] = useState<JoinType | null>(null);
  if (!user) return null;

  const rows: Row[] = [
    { icon: Package, label: 'طلباتي', to: '/orders' },
    {
      icon: MapPin,
      label: 'عناويني',
      hint: addresses.length ? `${num(addresses.length)} عنوان` : undefined,
      onClick: () => setAddressesOpen(true),
    },
    { icon: KeyRound, label: 'تغيير كلمة السر', onClick: () => setChanging(true) },
    { icon: Handshake, label: 'سجّل محلك كشريك', onClick: () => setJoin('store') },
    { icon: LogOut, label: 'خروج', onClick: () => void signOut(), danger: true },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <div className="flex items-center gap-4 pt-2">
        <Avatar name={user.name} size="lg" />
        <div className="flex-1">
          <div className="text-xl font-bold">{user.name}</div>
          <div className="flex items-center gap-1 text-sm text-ink-500">
            <Phone className="size-3.5" /> <span dir="ltr">{user.phone}</span>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-brand-700 p-5 text-white">
        <div className="absolute -bottom-12 -left-8 size-40 rounded-full bg-brand-600" />
        <Art name="courier" className="absolute bottom-2 left-3 size-24" />
        <div className="relative max-w-[62%]">
          <div className="text-lg font-bold">اطلب من {tenant.data?.name ?? 'هنا'}</div>
          <p className="mt-1 text-sm text-brand-100">
            مطاعم وصيدليات وسوبر ماركت، والدفع كاش عند الباب
          </p>
          <Link
            to="/"
            className="mt-3 inline-block text-sm font-bold text-sun-400 underline underline-offset-4"
          >
            تصفّح المحلات
          </Link>
        </div>
      </div>

      <PointsCard />

      <PushButton className="w-full py-3" />

      <div className="overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-ink-200/60">
        {rows.map((r) => {
          const content = (
            <>
              <r.icon className="size-5 shrink-0" strokeWidth={2} />
              <span className="flex-1 font-medium">{r.label}</span>
              {r.hint && <span className="text-sm text-ink-400">{r.hint}</span>}
              {!r.danger && <ChevronLeft className="size-5 text-ink-300" />}
            </>
          );
          const cls = `flex w-full cursor-pointer items-center gap-4 border-b border-ink-100 px-5 py-4 text-start transition last:border-0 hover:bg-ink-50 ${r.danger ? 'text-rose-600' : 'text-ink-800'}`;
          return r.to ? (
            <Link key={r.label} to={r.to} className={cls}>
              {content}
            </Link>
          ) : (
            <button key={r.label} onClick={r.onClick} className={cls}>
              {content}
            </button>
          );
        })}
      </div>

      <ChangePasswordModal open={changing} onClose={() => setChanging(false)} />
      <AddressSheet open={addressesOpen} onClose={() => setAddressesOpen(false)} />
      <JoinModal type={join} onClose={() => setJoin(null)} />
    </div>
  );
}

function PointsCard() {
  const points = useQuery({
    queryKey: ['points'],
    queryFn: () =>
      get<{
        enabled: boolean;
        balance: number;
        pointValue: number;
        earnPer: number;
        history: Array<{
          points: number;
          reason: string;
          createdAt: string;
          orderNumber: number | null;
        }>;
      }>('/me/points'),
  });
  const [open, setOpen] = useState(false);
  const p = points.data;
  if (!p?.enabled) return null;
  const REASONS: Record<string, string> = {
    earn: 'كسبت من طلب',
    redeem: 'استخدمتها في طلب',
    refund: 'رجعت من طلب ملغي',
  };
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center gap-4 rounded-3xl bg-sun-400 p-5 text-start text-ink-900 shadow-card"
      >
        <Art name="star" className="size-14" />
        <div className="flex-1">
          <div className="text-sm">نقاطك</div>
          <div className="tabular text-2xl font-extrabold">{num(p.balance)} نقطة</div>
          <div className="text-sm">
            تساوي {money(p.balance * p.pointValue)} · نقطة على كل {money(p.earnPer)}
          </div>
        </div>
        <ChevronLeft className="size-5" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="حركة النقاط" icon={Star}>
        {p.history.length === 0 && (
          <p className="text-sm text-ink-500">لسه مفيش حركة. اطلب وهتبدأ تجمع نقاط.</p>
        )}
        <div className="divide-y divide-ink-100">
          {p.history.map((h, i) => (
            <div key={i} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium">{REASONS[h.reason] ?? h.reason}</div>
                <div className="text-xs text-ink-500">
                  {h.orderNumber ? `${orderNo(h.orderNumber)} · ` : ''}
                  {dateTime(h.createdAt)}
                </div>
              </div>
              <span
                className={`tabular font-bold ${h.points > 0 ? 'text-brand-700' : 'text-rose-600'}`}
              >
                {h.points > 0 ? '+' : ''}
                {num(h.points)}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
