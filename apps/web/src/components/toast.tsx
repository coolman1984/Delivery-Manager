import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Toast = (message: string, kind?: 'info' | 'error') => void;
const ToastContext = createContext<Toast>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<
    Array<{ id: number; message: string; kind: 'info' | 'error' }>
  >([]);
  const push = useCallback<Toast>((message, kind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list.slice(-2), { id, message, kind }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg ${t.kind === 'error' ? 'bg-red-600' : 'bg-slate-900'}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
