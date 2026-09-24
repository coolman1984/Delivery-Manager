import { ACTIVE_ORDER_STATUSES } from '@dm/shared';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Bike, LayoutDashboard, Map as MapIcon, Settings, Wallet } from 'lucide-react';
import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { StaffShell } from '../../components/Shell';
import { get } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { Order } from '../../lib/types';
import Board from './Board';
import Drivers from './Drivers';
import LiveMap from './LiveMap';
import Reports from './Reports';
import Money from './Money';

const Admin = lazy(() => import('../admin/Admin'));

export default function OpsApp() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const orders = useQuery({
    queryKey: ['orders', 'ops', 'active'],
    queryFn: () => get<Order[]>(`/orders?status=${ACTIVE_ORDER_STATUSES.join(',')}`),
    refetchInterval: 30_000,
  });
  const waiting = orders.data?.filter((o) => !o.driverId && o.status !== 'placed').length ?? 0;
  const nav = [
    { to: '/ops', label: 'الطلبات', icon: LayoutDashboard, badge: waiting },
    { to: '/ops/map', label: 'الخريطة', icon: MapIcon },
    { to: '/ops/drivers', label: 'الطيارين', icon: Bike },
    { to: '/ops/money', label: 'الفلوس', icon: Wallet },
    { to: '/ops/reports', label: 'التقارير', icon: BarChart3 },
    ...(isAdmin ? [{ to: '/ops/admin', label: 'الإدارة', icon: Settings, end: false }] : []),
  ];
  return (
    <StaffShell nav={nav}>
      <Routes>
        <Route index element={<Board />} />
        <Route path="map" element={<LiveMap />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="money" element={<Money />} />
        <Route path="reports" element={<Reports />} />
        {isAdmin && <Route path="admin/*" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/ops" replace />} />
      </Routes>
    </StaffShell>
  );
}
