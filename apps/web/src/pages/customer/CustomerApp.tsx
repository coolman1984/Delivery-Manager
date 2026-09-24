import { Navigate, Route, Routes, useLocation } from 'react-router';
import type { ReactNode } from 'react';
import { Layout } from '../../components/Layout';
import { useAuth } from '../../lib/auth';
import { useCart } from '../../lib/cart';
import Checkout from './Checkout';
import Home from './Home';
import OrderPage from './OrderPage';
import Orders from './Orders';
import StorePage from './StorePage';

function RequireLogin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function CustomerApp() {
  const cart = useCart();
  const { user } = useAuth();
  const nav = [
    { to: '/', label: 'المحلات', icon: '🏪' },
    { to: '/cart', label: `السلة${cart.count ? ` (${cart.count})` : ''}`, icon: '🛒' },
    user
      ? { to: '/orders', label: 'طلباتي', icon: '📦' }
      : { to: '/login', label: 'دخول', icon: '👤' },
  ];
  return (
    <Layout nav={nav} title="اطلب">
      <Routes>
        <Route index element={<Home />} />
        <Route path="stores/:id" element={<StorePage />} />
        <Route
          path="cart"
          element={
            <RequireLogin>
              <Checkout />
            </RequireLogin>
          }
        />
        <Route
          path="orders"
          element={
            <RequireLogin>
              <Orders />
            </RequireLogin>
          }
        />
        <Route
          path="orders/:id"
          element={
            <RequireLogin>
              <OrderPage />
            </RequireLogin>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
