import { House, LogIn, Package, ShoppingBag, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { CustomerShell } from '../../components/Shell';
import { useAuth } from '../../lib/auth';
import { useCart } from '../../lib/cart';
import Account from './Account';
import Checkout from './Checkout';
import Errand from './Errand';
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
    { to: '/', label: 'الرئيسية', icon: House },
    { to: '/orders', label: 'طلباتي', icon: Package, end: false },
    { to: '/cart', label: 'السلة', icon: ShoppingBag, badge: cart.count },
    user
      ? { to: '/account', label: 'حسابي', icon: User }
      : { to: '/login', label: 'دخول', icon: LogIn },
  ];
  return (
    <CustomerShell nav={nav}>
      <Routes>
        <Route index element={<Home />} />
        <Route path="stores/:id" element={<StorePage />} />
        <Route
          path="errand"
          element={
            <RequireLogin>
              <Errand />
            </RequireLogin>
          }
        />
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
        <Route
          path="account"
          element={
            <RequireLogin>
              <Account />
            </RequireLogin>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CustomerShell>
  );
}
