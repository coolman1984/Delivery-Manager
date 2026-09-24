import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { DialogProvider } from './components/dialog';
import { ToastProvider } from './components/toast';
import { ApiError } from './lib/api';
import { AuthProvider } from './lib/auth';
import { CartProvider } from './lib/cart';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // النت الضعيف: نعيد المحاولة مرتين، إلا لو الغلط مننا (زي مش مسموح)
      retry: (count, err) =>
        count < 2 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <DialogProvider>
          <AuthProvider>
            <CartProvider>
              <BrowserRouter>
                <App />
              </BrowserRouter>
            </CartProvider>
          </AuthProvider>
        </DialogProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
