import type { OrderStatus } from '@dm/shared';
import { ORDER_STATUS_LABELS } from '@dm/shared';
import { ChevronDown, CircleAlert, LoaderCircle, type LucideIcon } from 'lucide-react';
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { money, num } from '../lib/format';

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');
export { cx };

// ———— الأزرار ————

type Variant = 'primary' | 'dark' | 'secondary' | 'soft' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const variantClass: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-brand hover:bg-brand-700 disabled:bg-ink-300 disabled:shadow-none',
  dark: 'bg-ink-900 text-white hover:bg-ink-800 disabled:bg-ink-300',
  secondary:
    'bg-white text-ink-800 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 disabled:text-ink-400',
  soft: 'bg-brand-50 text-brand-700 hover:bg-brand-100 disabled:bg-ink-100 disabled:text-ink-400',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 disabled:bg-ink-300',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900 disabled:text-ink-300',
};
const sizeClass: Record<Size, string> = {
  sm: 'h-9 gap-1.5 rounded-xl px-3 text-sm',
  md: 'h-11 gap-2 rounded-2xl px-4 text-[15px]',
  lg: 'h-14 gap-2.5 rounded-2xl px-6 text-base',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon: Icon, block, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      {...props}
      disabled={props.disabled || loading}
      className={cx(
        'inline-flex shrink-0 cursor-pointer items-center justify-center font-semibold transition duration-150 select-none active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100',
        variantClass[variant],
        sizeClass[size],
        block && 'w-full',
        className,
      )}
    >
      {loading ? (
        <LoaderCircle className="size-5 animate-spin" />
      ) : (
        Icon && <Icon className={size === 'sm' ? 'size-4' : 'size-5'} strokeWidth={2.2} />
      )}
      {children}
    </button>
  );
});

export function IconButton({
  icon: Icon,
  label,
  tone = 'ghost',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  tone?: 'ghost' | 'soft' | 'white';
}) {
  return (
    <button
      {...props}
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-2xl transition active:scale-95',
        tone === 'ghost' && 'text-ink-600 hover:bg-ink-100',
        tone === 'soft' && 'bg-brand-50 text-brand-700 hover:bg-brand-100',
        tone === 'white' && 'bg-white/90 text-ink-800 shadow-card backdrop-blur hover:bg-white',
        className,
      )}
    >
      <Icon className="size-5" strokeWidth={2.2} />
    </button>
  );
}

// ———— خانات الإدخال ————

function FieldShell({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="block">
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-rose-600">
          <CircleAlert className="size-3.5" /> {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-ink-500">{hint}</p>
      )}
    </div>
  );
}

const inputBase =
  'w-full rounded-2xl border-0 bg-white text-ink-900 ring-1 ring-inset ring-ink-200 placeholder:text-ink-400 transition focus:outline-none focus:ring-2 focus:ring-brand-500';

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    label?: string;
    hint?: string;
    error?: string;
    icon?: LucideIcon;
    suffix?: ReactNode;
  }
>(function Input({ label, hint, error, icon: Icon, suffix, className, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <FieldShell id={inputId} label={label} hint={hint} error={error}>
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-5 text-ink-400" />
        )}
        <input
          ref={ref}
          id={inputId}
          {...props}
          className={cx(
            inputBase,
            'h-12 px-4',
            Icon && 'ps-11',
            suffix != null && 'pe-14',
            className,
          )}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 end-4 my-auto flex items-center text-sm text-ink-500">
            {suffix}
          </span>
        )}
      </div>
    </FieldShell>
  );
});

export function Textarea({
  label,
  hint,
  id,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string }) {
  const autoId = useId();
  return (
    <FieldShell id={id ?? autoId} label={label} hint={hint}>
      <textarea
        id={id ?? autoId}
        rows={2}
        {...props}
        className={cx(inputBase, 'resize-none px-4 py-3', className)}
      />
    </FieldShell>
  );
}

export function Select({
  label,
  hint,
  id,
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: string }) {
  const autoId = useId();
  return (
    <FieldShell id={id ?? autoId} label={label} hint={hint}>
      <div className="relative">
        <select
          id={id ?? autoId}
          {...props}
          className={cx(inputBase, 'h-12 cursor-pointer appearance-none ps-4 pe-10', className)}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute inset-y-0 end-3.5 my-auto size-5 text-ink-400" />
      </div>
    </FieldShell>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  size = 'md',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: 'md' | 'lg';
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-50',
        size === 'lg' ? 'h-8 w-14' : 'h-6 w-11',
        checked ? 'bg-emerald-500' : 'bg-ink-300',
      )}
    >
      <span
        className={cx(
          'absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow transition-all',
          size === 'lg' ? 'size-6' : 'size-5',
        )}
        style={{ insetInlineStart: checked ? (size === 'lg' ? 28 : 22) : size === 'lg' ? 4 : 2 }}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'no-scrollbar inline-flex gap-1 overflow-x-auto rounded-2xl bg-ink-100 p-1',
        className,
      )}
      role="tablist"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition',
            value === o.value
              ? 'bg-white text-ink-900 shadow-card'
              : 'text-ink-500 hover:text-ink-800',
          )}
        >
          {o.label}
          {o.count !== undefined && o.count > 0 && (
            <span
              className={cx(
                'tabular min-w-5 rounded-full px-1.5 text-xs',
                value === o.value ? 'bg-brand-600 text-white' : 'bg-ink-200 text-ink-600',
              )}
            >
              {num(o.count)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ———— الكروت والعناوين ————

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-3xl bg-white shadow-card ring-1 ring-ink-200/60',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  icon: Icon,
  action,
  className,
}: {
  children: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
        {Icon && <Icon className="size-5 text-brand-600" strokeWidth={2.2} />}
        {children}
      </h2>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ———— الشارات والحالات ————

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'violet';
const toneClass: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-800',
  danger: 'bg-rose-50 text-rose-700',
  info: 'bg-sky-50 text-sky-700',
  violet: 'bg-violet-50 text-violet-700',
};
const dotClass: Record<Tone, string> = {
  neutral: 'bg-ink-400',
  brand: 'bg-brand-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-rose-500',
  info: 'bg-sky-500',
  violet: 'bg-violet-500',
};

export function Badge({
  tone = 'neutral',
  dot,
  children,
  className,
}: {
  tone?: Tone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        toneClass[tone],
        className,
      )}
    >
      {dot && <span className={cx('size-1.5 rounded-full', dotClass[tone])} />}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<OrderStatus, Tone> = {
  placed: 'warning',
  accepted: 'info',
  ready: 'violet',
  picked_up: 'brand',
  delivered: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

// ———— التحميل والحالات الفاضية ————

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-2xl bg-ink-200/70', className)} />;
}

export function SkeletonList({
  count = 3,
  className = 'h-24',
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className="space-y-3" aria-label="جاري التحميل" role="status">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  );
}

export function FullPageLoader() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center"
      role="status"
      aria-label="جاري التحميل"
    >
      <LoaderCircle className="size-8 animate-spin text-brand-600" />
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-brand-50 text-brand-600">
        <Icon className="size-8" strokeWidth={1.8} />
      </div>
      <h3 className="font-bold text-ink-900">{title}</h3>
      {text && <p className="mt-1 max-w-xs text-sm text-ink-500">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'حصلت مشكلة';
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-rose-50 p-3.5 text-sm text-rose-700 ring-1 ring-rose-100">
      <CircleAlert className="mt-0.5 size-4 shrink-0" />
      {message}
    </div>
  );
}

// ———— الأرقام ————

export function Money({ value, className }: { value: number; className?: string }) {
  return <span className={cx('tabular whitespace-nowrap', className)}>{money(value)}</span>;
}

export function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'danger';
}) {
  const iconTone = {
    neutral: 'bg-ink-100 text-ink-700',
    brand: 'bg-brand-50 text-brand-600',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-rose-50 text-rose-600',
  }[tone];
  return (
    <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:gap-3.5 sm:p-5">
      <div
        className={cx('flex size-11 shrink-0 items-center justify-center rounded-2xl', iconTone)}
      >
        <Icon className="size-5" strokeWidth={2.2} />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-ink-500">{label}</div>
        <div className="tabular mt-0.5 text-lg font-bold text-ink-900 sm:text-xl">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-ink-500">{hint}</div>}
      </div>
    </Card>
  );
}

// ———— صورة رمزية بالحروف الأولى ————

const AVATAR_COLORS = [
  'bg-brand-100 text-brand-800',
  'bg-sky-100 text-sky-800',
  'bg-emerald-100 text-emerald-800',
  'bg-violet-100 text-violet-800',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-800',
];

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const hash = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const initials = name.trim().charAt(0);
  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center rounded-2xl font-bold',
        AVATAR_COLORS[hash % AVATAR_COLORS.length],
        size === 'sm' && 'size-8 text-xs',
        size === 'md' && 'size-11 text-sm',
        size === 'lg' && 'size-14 text-base',
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}
