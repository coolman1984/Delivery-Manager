import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Layout } from '../../components/Layout';
import { useAuth } from '../../lib/auth';
import Board from './Board';
import Drivers from './Drivers';
import Money from './Money';

const Admin = lazy(() => import('../admin/Admin'));

export default function OpsApp() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const nav = [
    { to: '/ops', label: 'الطلبات', icon: '📋' },
    { to: '/ops/drivers', label: 'الطيارين', icon: '🛵' },
    { to: '/ops/money', label: 'الفلوس', icon: '💰' },
    ...(isAdmin ? [{ to: '/ops/admin', label: 'الإدارة', icon: '⚙️' }] : []),
  ];
  return (
    <Layout title="لوحة التشغيل" nav={nav}>
      <Routes>
        <Route index element={<Board />} />
        <Route path="drivers" element={<Drivers />} />
        <Route path="money" element={<Money />} />
        {isAdmin && <Route path="admin/*" element={<Admin />} />}
        <Route path="*" element={<Navigate to="/ops" replace />} />
      </Routes>
    </Layout>
  );
}
