import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Crown, LayoutDashboard, LogOut, Package, ScrollText } from 'lucide-react';
import { NavLink, Route, Routes } from 'react-router';
import { Avatar, cx, FullPageLoader } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { pget, ppost, type PlatformMe } from './api';
import Audit from './Audit';
import Overview from './Overview';
import PlatformLogin from './PlatformLogin';
import Plans from './Plans';
import Tenants from './Tenants';

const NAV = [
  { to: '/platform', label: 'نظرة عامة', icon: LayoutDashboard, end: true },
  { to: '/platform/tenants', label: 'الشركات', icon: Building2 },
  { to: '/platform/plans', label: 'الباقات', icon: Package },
  { to: '/platform/audit', label: 'السجل', icon: ScrollText },
];

/** لوحة مالك المنصة: تصميم غامق بلمسة دهبي عشان ماتتلخبطش مع لوحات الشركات */
export default function PlatformApp() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['platform', 'me'],
    queryFn: () => pget<PlatformMe>('/auth/me'),
    retry: false,
  });
  const logout = useMutation({
    mutationFn: () => ppost('/auth/logout'),
    onSettled: () => qc.removeQueries({ queryKey: ['platform'] }),
  });

  if (me.isPending) return <FullPageLoader />;
  if (me.error || !me.data) {
    const expired = me.error instanceof ApiError && me.error.status === 401;
    if (!expired && me.error) throw me.error;
    return <PlatformLogin onDone={() => void qc.invalidateQueries({ queryKey: ['platform'] })} />;
  }

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-[#0f1020] p-4 md:flex">
        <div className="flex items-center gap-3 px-2 pt-2 pb-6">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
            <Crown className="size-5" />
          </span>
          <div className="leading-tight">
            <div className="font-bold text-white">مالك المنصة</div>
            <div className="text-xs text-indigo-200/60">إدارة الشركات المشتركة</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-indigo-200/60 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon
                    className={cx('size-5', isActive && 'text-amber-300')}
                    strokeWidth={2.2}
                  />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="rounded-2xl bg-white/5 p-3">
          <div className="flex items-center gap-3">
            <Avatar name={me.data.name} size="sm" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold text-white">{me.data.name}</div>
              <div className="truncate text-xs text-indigo-200/60" dir="ltr">
                {me.data.email}
              </div>
            </div>
          </div>
          <button
            onClick={() => logout.mutate()}
            className="mt-3 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white/5 py-2 text-xs text-indigo-100/70 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-3.5" /> خروج من كل الأجهزة
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-24 md:pb-10">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between bg-[#0f1020] px-4 md:hidden">
          <div className="flex items-center gap-2 font-bold text-white">
            <Crown className="size-5 text-amber-300" /> مالك المنصة
          </div>
          <button
            onClick={() => logout.mutate()}
            className="cursor-pointer rounded-xl p-2 text-indigo-100/70"
            aria-label="خروج"
          >
            <LogOut className="size-5" />
          </button>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-5 md:px-8 md:py-8">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="tenants" element={<Tenants />} />
            <Route path="plans" element={<Plans />} />
            <Route path="audit" element={<Audit />} />
          </Routes>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              cx(
                'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium',
                isActive ? 'text-[#0f1020]' : 'text-ink-400',
              )
            }
          >
            <n.icon className="size-5" />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
