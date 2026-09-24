import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { FullPageLoader } from './components/ui';
import { useAuth } from './lib/auth';
import Login from './pages/Login';
import { getTenantSlug } from './lib/tenant';

// كل دور بيحمّل الجزء بتاعه بس، عشان التطبيق يفتح بسرعة على الموبايلات الضعيفة
const Customer = lazy(() => import('./pages/customer/CustomerApp'));
const StoreApp = lazy(() => import('./pages/store/StoreApp'));
const DriverApp = lazy(() => import('./pages/driver/DriverApp'));
const OpsApp = lazy(() => import('./pages/ops/OpsApp'));
// لوحة مالك المنصة: منفصلة تماماً عن حسابات الشركات
const PlatformApp = lazy(() => import('./pages/platform/PlatformApp'));

export default function App() {
  const location = useLocation();
  if (location.pathname === '/platform' || location.pathname.startsWith('/platform/')) {
    return (
      <Suspense fallback={<FullPageLoader />}>
        <Routes>
          <Route path="/platform/*" element={<PlatformApp />} />
        </Routes>
      </Suspense>
    );
  }
  // عنوان لوحة المنصة (admin.الموقع) مالوش صفحات شركات
  if (getTenantSlug() === 'admin') return <Navigate to="/platform" replace />;
  return <TenantApp />;
}

function TenantApp() {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <FullPageLoader />;

  const home =
    !user || user.role === 'customer'
      ? '/'
      : user.role === 'store'
        ? '/store'
        : user.role === 'driver'
          ? '/driver'
          : '/ops';
  // بعد الدخول: العميل يرجع للصفحة اللي كان فيها (زي السلة)
  const from = (location.state as { from?: string } | null)?.from;
  const afterLogin = user?.role === 'customer' && from?.startsWith('/') ? from : home;

  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={afterLogin} replace /> : <Login />} />
        <Route
          path="/store/*"
          element={user?.role === 'store' ? <StoreApp /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/driver/*"
          element={user?.role === 'driver' ? <DriverApp /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/ops/*"
          element={
            user?.role === 'ops' || user?.role === 'admin' ? (
              <OpsApp />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/*"
          element={user && user.role !== 'customer' ? <Navigate to={home} replace /> : <Customer />}
        />
      </Routes>
    </Suspense>
  );
}
