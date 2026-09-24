import { ORDER_STATUS_LABELS, type OrderStatus } from '@dm/shared';
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-slate-300',
  secondary:
    'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300',
  ghost: 'text-brand-700 hover:bg-brand-50',
};

export function Button({
  variant = 'primary',
  loading,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98] ${variants[variant]} ${className}`}
    >
      {loading ? <Spinner small /> : children}
    </button>
  );
}

export function Input({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <input
        {...props}
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
      />
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Select({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      <select
        {...props}
        className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base outline-none focus:border-brand-600"
      >
        {children}
      </select>
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${className}`}>
      {children}
    </div>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label="جاري التحميل"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'size-4' : 'size-8 text-brand-600'}`}
    />
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}

export function Empty({ icon = '📭', text }: { icon?: string; text: string }) {
  return (
    <div className="py-16 text-center text-slate-500">
      <div className="mb-2 text-4xl">{icon}</div>
      {text}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'حصلت مشكلة';
  return <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">⚠️ {message}</div>;
}

const statusColors: Record<OrderStatus, string> = {
  placed: 'bg-amber-100 text-amber-800',
  accepted: 'bg-sky-100 text-sky-800',
  ready: 'bg-violet-100 text-violet-800',
  picked_up: 'bg-indigo-100 text-indigo-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-slate-200 text-slate-700',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[status]}`}
    >
      {ORDER_STATUS_LABELS[status]}
    </span>
  );
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h1 className="text-xl font-bold">{children}</h1>
      {action}
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  tone?: 'default' | 'warn';
}) {
  return (
    <div
      className={`rounded-2xl p-4 ring-1 ${tone === 'warn' ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-slate-200'}`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="tabular mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}
