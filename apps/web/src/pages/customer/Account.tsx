import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, KeyRound, LogOut, MapPin, Package } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { ChangePasswordModal } from '../../components/Shell';
import { Avatar, Card } from '../../components/ui';
import { get } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Address } from '../../lib/types';

export default function Account() {
  const { user, signOut } = useAuth();
  const [changing, setChanging] = useState(false);
  const addresses = useQuery({
    queryKey: ['addresses'],
    queryFn: () => get<Address[]>('/me/addresses'),
  });
  if (!user) return null;

  const rows = [
    { icon: Package, label: 'طلباتي', to: '/orders' },
    { icon: KeyRound, label: 'تغيير كلمة السر', onClick: () => setChanging(true) },
    { icon: LogOut, label: 'خروج', onClick: () => void signOut(), danger: true },
  ];

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Card className="flex items-center gap-4">
        <Avatar name={user.name} size="lg" />
        <div>
          <div className="text-lg font-bold">{user.name}</div>
          <div className="text-sm text-ink-500">
            <span dir="ltr">{user.phone}</span>
          </div>
        </div>
      </Card>

      <Card padded={false} className="divide-y divide-ink-100">
        <div className="flex items-center gap-2 px-5 pt-4 pb-3 text-sm font-bold text-ink-900">
          <MapPin className="size-4 text-brand-600" /> عناويني
        </div>
        {addresses.data?.length === 0 && (
          <p className="px-5 py-4 text-sm text-ink-500">لسه ماضفتش عناوين. هتضيفها وقت الطلب.</p>
        )}
        {addresses.data?.map((a) => (
          <div key={a.id} className="px-5 py-3.5">
            <div className="font-medium">{a.label}</div>
            <div className="text-sm text-ink-500">
              {a.zoneName} — {a.details}
            </div>
          </div>
        ))}
      </Card>

      <Card padded={false} className="divide-y divide-ink-100 overflow-hidden">
        {rows.map((r) => {
          const content = (
            <>
              <r.icon className="size-5" />
              <span className="flex-1 font-medium">{r.label}</span>
              {!r.danger && <ChevronLeft className="size-5 text-ink-300" />}
            </>
          );
          const cls = `flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-start transition hover:bg-ink-50 ${r.danger ? 'text-rose-600' : 'text-ink-800'}`;
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
      </Card>
      <ChangePasswordModal open={changing} onClose={() => setChanging(false)} />
    </div>
  );
}
