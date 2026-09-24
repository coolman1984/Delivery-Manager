import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Product } from './types';

export interface CartLine {
  product: Product;
  quantity: number;
}

interface Cart {
  storeId: string | null;
  storeName: string | null;
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (storeId: string, storeName: string, product: Product) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<Cart | null>(null);
const KEY = 'dm.cart';

interface Stored {
  storeId: string | null;
  storeName: string | null;
  lines: CartLine[];
}

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // مش مشكلة
  }
  return { storeId: null, storeName: null, lines: [] };
}

/** السلة: من محل واحد في المرة، ومتحفظة على الموبايل لو قفل الصفحة */
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Stored>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // مش مشكلة
    }
  }, [state]);

  const add = useCallback((storeId: string, storeName: string, product: Product) => {
    setState((s) => {
      const base = s.storeId === storeId ? s : { storeId, storeName, lines: [] };
      const existing = base.lines.find((l) => l.product.id === product.id);
      const lines = existing
        ? base.lines.map((l) =>
            l.product.id === product.id ? { ...l, quantity: Math.min(99, l.quantity + 1) } : l,
          )
        : [...base.lines, { product, quantity: 1 }];
      return { ...base, lines };
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setState((s) => {
      const lines = s.lines
        .map((l) => (l.product.id === productId ? { ...l, quantity: Math.min(99, quantity) } : l))
        .filter((l) => l.quantity > 0);
      return lines.length ? { ...s, lines } : { storeId: null, storeName: null, lines: [] };
    });
  }, []);

  const clear = useCallback(() => setState({ storeId: null, storeName: null, lines: [] }), []);

  const value = useMemo<Cart>(
    () => ({
      ...state,
      count: state.lines.reduce((n, l) => n + l.quantity, 0),
      subtotal: state.lines.reduce((n, l) => n + l.quantity * l.product.price, 0),
      add,
      setQuantity,
      clear,
    }),
    [state, add, setQuantity, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): Cart {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart outside CartProvider');
  return ctx;
}
