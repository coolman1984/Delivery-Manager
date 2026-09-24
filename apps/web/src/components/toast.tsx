import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type Kind = 'success' | 'error' | 'info';
type Toast = (message: string, kind?: Kind) => void;
const ToastContext = createContext<Toast>(() => undefined);

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const COLORS = { success: 'text-emerald-400', error: 'text-rose-400', info: 'text-brand-300' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Array<{ id: number; message: string; kind: Kind }>>([]);
  const push = useCallback<Toast>((message, kind = 'success') => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list.slice(-2), { id, message, kind }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 3800);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {items.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div
              key={t.id}
              className="animate-pop flex max-w-sm items-center gap-2.5 rounded-2xl bg-ink-900 px-4 py-3 text-sm font-medium text-white shadow-lift"
            >
              <Icon className={`size-5 shrink-0 ${COLORS[t.kind]}`} />
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
