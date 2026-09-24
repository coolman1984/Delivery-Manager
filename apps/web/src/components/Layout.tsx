import { ROLE_LABELS } from '@dm/shared';
import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useAuth } from '../lib/auth';
import { post } from '../lib/api';
import { useRealtime } from '../lib/realtime';
import { useToast } from './toast';
import { Button, ErrorBox, Input } from './ui';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
}

/** الإطار العام: شريط علوي + قائمة سفلية على الموبايل */
export function Layout({
  nav,
  children,
  title,
}: {
  nav: NavItem[];
  children: ReactNode;
  title: string;
}) {
  const { user, signOut } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  useRealtime();
  return (
    <div className="mx-auto min-h-dvh max-w-5xl pb-24 md:pb-8">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="font-bold text-brand-700">🛵 {title}</div>
        <nav className="hidden gap-1 md:flex">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-brand-50 font-semibold text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`
              }
            >
              {n.icon} {n.label}
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-slate-500 sm:inline">
              {user.name} · {ROLE_LABELS[user.role]}
            </span>
            {user.role !== 'customer' && (
              <button
                onClick={() => setChangingPassword(true)}
                className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
                title="تغيير كلمة السر"
              >
                🔑
              </button>
            )}
            <button
              onClick={() => void signOut()}
              className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100"
            >
              خروج
            </button>
          </div>
        )}
      </header>
      {changingPassword && <ChangePassword onClose={() => setChangingPassword(false)} />}
      <main className="px-4 py-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'font-semibold text-brand-700' : 'text-slate-500'}`
            }
          >
            <span className="text-lg leading-none">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function ChangePassword({ onClose }: { onClose: () => void }) {
  const { signOut } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/auth/change-password', { currentPassword: current, newPassword: next });
      toast('اتغيرت كلمة السر ✅ سجل دخول تاني');
      await signOut();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-slate-200 bg-white px-4 py-4">
      <form onSubmit={submit} className="mx-auto grid max-w-md gap-3">
        <h2 className="font-semibold">🔑 تغيير كلمة السر</h2>
        <Input
          label="كلمة السر الحالية"
          type="password"
          autoComplete="current-password"
          dir="ltr"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <Input
          label="كلمة السر الجديدة (١٠ حروف على الأقل)"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          minLength={10}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
        {error !== null && <ErrorBox error={error} />}
        <div className="flex gap-2">
          <Button type="submit" loading={busy}>
            حفظ
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </form>
    </div>
  );
}
