import {
  ChevronLeft,
  Handshake,
  KeyRound,
  LogOut,
  MapPin,
  Package,
  Phone,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { AddressSheet } from '../../components/AddressSheet';
import { JoinModal, type JoinType } from '../../components/JoinModal';
import { ChangePasswordModal, useTenant } from '../../components/Shell';
import { Art } from '../../components/visual';
import { Avatar } from '../../components/ui';
import { useSelectedAddress } from '../../lib/address';
import { useAuth } from '../../lib/auth';
import { num } from '../../lib/format';

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
