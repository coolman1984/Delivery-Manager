import { ROLE_LABELS } from '@dm/shared';
import { useQuery } from '@tanstack/react-query';
import { Bike, KeyRound, LogOut, type LucideIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { num } from '../lib/format';
import { useRealtime } from '../lib/realtime';
import type { TenantPublic } from '../lib/types';
import { Modal } from './dialog';
import { useToast } from './toast';
import { Avatar, Button, cx, ErrorBox, Input } from './ui';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  end?: boolean;
}

export function useTenant() {
  return useQuery({
    queryKey: ['tenant'],
    queryFn: () => get<TenantPublic>('/auth/tenant'),
    staleTime: Infinity,
  });
}

export function BrandMark({
  className = 'size-10',
  glass,
}: {
  className?: string;
  glass?: boolean;
}) {
  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center rounded-2xl text-white',
        glass
          ? 'bg-white/20 ring-1 ring-white/30 backdrop-blur'
          : 'bg-gradient-to-br from-brand-500 to-brand-700 shadow-brand',
        className,
      )}
    >
      <Bike className="size-[55%]" strokeWidth={2.2} />
    </div>
  );
}

function Brand({ dark }: { dark?: boolean }) {
  const tenant = useTenant();
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="leading-tight">
        <div className={cx('font-bold', dark ? 'text-white' : 'text-ink-900')}>
          {tenant.data?.name ?? 'توصيل'}
        </div>
        <div className={cx('text-xs', dark ? 'text-ink-400' : 'text-ink-500')}>
          {tenant.data?.governorate ?? ''}
        </div>
      </div>
    </div>
  );
}

function BottomNav({ nav }: { nav: NavItem[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-lg">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end ?? true}
            className={({ isActive }) =>
              cx(
                'relative flex flex-1 flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium transition',
                isActive ? 'text-brand-600' : 'text-ink-500',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={cx(
                    'flex h-7 w-12 items-center justify-center rounded-full transition',
                    isActive && 'bg-brand-50',
                  )}
                >
                  <n.icon className="size-[22px]" strokeWidth={isActive ? 2.4 : 2} />
                </span>
                {n.label}
                {!!n.badge && (
                  <span className="tabular absolute top-1.5 left-1/2 ms-3 min-w-5 rounded-full bg-brand-600 px-1 text-center text-[10px] leading-5 font-bold text-white ring-2 ring-white">
                    {num(n.badge)}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** إطار تطبيق العميل: شريط علوي بسيط + قائمة سفلية زي تطبيقات الموبايل */
export function CustomerShell({ nav, children }: { nav: NavItem[]; children: ReactNode }) {
  useRealtime();
  const { pathname } = useLocation();
  const tenant = useTenant();
  return (
    <div className="min-h-dvh pb-24 md:pb-0">
      <header
        className={cx(
          'sticky top-0 z-30 border-b border-ink-200/60 bg-white/90 backdrop-blur',
          pathname === '/' && 'hidden md:block',
        )}
      >
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
          <Brand />
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end ?? true}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm font-medium transition',
                    isActive
                      ? 'bg-white text-brand-700 shadow-card'
                      : 'text-ink-600 hover:bg-white/70',
                  )
                }
              >
                <n.icon className="size-[18px]" />
                {n.label}
                {!!n.badge && (
                  <span className="tabular rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">
                    {num(n.badge)}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 md:py-8">{children}</main>
      <footer className="mt-10 hidden bg-ink-900 text-ink-400 md:block">
        <div className="mx-auto grid max-w-6xl grid-cols-3 gap-8 px-4 py-10 text-sm">
          <div>
            <Brand dark />
            <p className="mt-3 leading-relaxed">
              توصيل طلبات من المطاعم والصيدليات والسوبر ماركت في{' '}
              {tenant.data?.governorate ?? 'محافظتك'}، والدفع كاش عند الباب.
            </p>
          </div>
          <div>
            <div className="mb-3 font-semibold text-white">اطلب</div>
            <ul className="space-y-2">
              <li>مطاعم</li>
              <li>سوبر ماركت</li>
              <li>صيدليات</li>
            </ul>
          </div>
          <div>
            <div className="mb-3 font-semibold text-white">اشتغل معانا</div>
            <ul className="space-y-2">
              <li>سجّل محلك كشريك</li>
              <li>اشتغل طيار</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs">
          © {new Date().getFullYear()} {tenant.data?.name ?? ''}
        </div>
      </footer>
      <BottomNav nav={nav} />
    </div>
  );
}

/** إطار شاشات الموظفين: قائمة جانبية على الكمبيوتر، وقائمة سفلية على الموبايل */
export function StaffShell({ nav, children }: { nav: NavItem[]; children: ReactNode }) {
  const { user, signOut } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  useRealtime();

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-ink-900 p-4 md:flex">
        <div className="px-2 pt-2 pb-6">
          <Brand dark />
        </div>
        <nav className="flex-1 space-y-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end ?? true}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-ink-400 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon
                    className={cx('size-5', isActive && 'text-brand-400')}
                    strokeWidth={2.2}
                  />
                  <span className="flex-1">{n.label}</span>
                  {!!n.badge && (
                    <span className="tabular rounded-full bg-brand-600 px-2 text-xs font-bold text-white">
                      {num(n.badge)}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size="sm" />
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-semibold text-white">{user.name}</div>
                <div className="text-xs text-ink-400">{ROLE_LABELS[user.role]}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => setChangingPassword(true)}
                className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white/5 py-2 text-xs text-ink-300 hover:bg-white/10 hover:text-white"
              >
                <KeyRound className="size-3.5" /> كلمة السر
              </button>
              <button
                onClick={() => void signOut()}
                className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white/5 py-2 text-xs text-ink-300 hover:bg-white/10 hover:text-white"
              >
                <LogOut className="size-3.5" /> خروج
              </button>
            </div>
          </div>
        )}
      </aside>

      <div className="min-w-0 flex-1 pb-24 md:pb-10">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-ink-200/60 bg-canvas/90 px-4 backdrop-blur md:hidden">
          <Brand />
          <div className="flex items-center gap-1">
            <button
              onClick={() => setChangingPassword(true)}
              className="cursor-pointer rounded-xl p-2 text-ink-500 hover:bg-ink-100"
              aria-label="تغيير كلمة السر"
            >
              <KeyRound className="size-5" />
            </button>
            <button
              onClick={() => void signOut()}
              className="cursor-pointer rounded-xl p-2 text-ink-500 hover:bg-ink-100"
              aria-label="خروج"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">{children}</main>
      </div>
      <BottomNav nav={nav} />
      <ChangePasswordModal open={changingPassword} onClose={() => setChangingPassword(false)} />
    </div>
  );
}

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      toast('اتغيرت كلمة السر، ادخل تاني بالجديدة');
      await signOut();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تغيير كلمة السر"
      description="هتخرج من كل الأجهزة التانية بعد التغيير"
      icon={KeyRound}
    >
      <form onSubmit={submit} className="space-y-4">
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
          label="كلمة السر الجديدة"
          hint="١٠ حروف على الأقل"
          type="password"
          autoComplete="new-password"
          dir="ltr"
          minLength={10}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
        {error !== null && <ErrorBox error={error} />}
        <Button type="submit" loading={busy} block>
          حفظ كلمة السر
        </Button>
      </form>
    </Modal>
  );
}
