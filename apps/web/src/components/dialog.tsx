import { X, type LucideIcon } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Button, cx, Input } from './ui';

/**
 * نافذة منبثقة: على الموبايل بتطلع من تحت (أسهل للصباع)، وعلى الكمبيوتر في النص.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current
      ?.querySelector<HTMLElement>('input, select, textarea, button[data-autofocus]')
      ?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal
      aria-label={title}
    >
      <div
        className="animate-fade absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panel}
        className={cx(
          'animate-slide-up relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[28px] bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lift sm:rounded-[28px]',
          size === 'md' ? 'sm:max-w-md' : 'sm:max-w-2xl',
        )}
      >
        <div className="mx-auto -mt-2 mb-4 h-1.5 w-10 rounded-full bg-ink-200 sm:hidden" />
        <div className="mb-5 flex items-start gap-3">
          {Icon && (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
              <Icon className="size-5" strokeWidth={2.2} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-ink-900">{title}</h2>
            {description && <div className="mt-1 text-sm text-ink-500">{description}</div>}
          </div>
          <button
            onClick={onClose}
            className="-m-1 cursor-pointer rounded-xl p-1.5 text-ink-400 hover:bg-ink-100"
            aria-label="إغلاق"
          >
            <X className="size-5" />
          </button>
        </div>
        {children}
        {footer && (
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-start">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ———— تأكيد وسؤال سريع (بديل النوافذ الرمادية بتاعة المتصفح) ————

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  icon?: LucideIcon;
}
interface PromptOptions extends ConfirmOptions {
  label: string;
  defaultValue?: string;
  placeholder?: string;
  suggestions?: string[];
  inputMode?: 'text' | 'decimal' | 'numeric';
  minLength?: number;
  type?: string;
  validate?: (value: string) => string | null;
}

type Pending =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void };

interface DialogApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ kind: 'confirm', opts, resolve })),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => setPending({ kind: 'prompt', opts, resolve })),
    [],
  );
  const close = () => {
    if (pending?.kind === 'confirm') pending.resolve(false);
    if (pending?.kind === 'prompt') pending.resolve(null);
    setPending(null);
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {pending?.kind === 'confirm' && (
        <Modal
          open
          onClose={close}
          title={pending.opts.title}
          description={pending.opts.description}
          icon={pending.opts.icon}
          footer={
            <>
              <Button
                data-autofocus
                variant={pending.opts.danger ? 'danger' : 'primary'}
                onClick={() => {
                  pending.resolve(true);
                  setPending(null);
                }}
              >
                {pending.opts.confirmLabel ?? 'تأكيد'}
              </Button>
              <Button variant="secondary" onClick={close}>
                رجوع
              </Button>
            </>
          }
        />
      )}
      {pending?.kind === 'prompt' && (
        <PromptDialog
          opts={pending.opts}
          onCancel={close}
          onSubmit={(v) => {
            pending.resolve(v);
            setPending(null);
          }}
        />
      )}
    </DialogContext.Provider>
  );
}

function PromptDialog({
  opts,
  onCancel,
  onSubmit,
}: {
  opts: PromptOptions;
  onCancel: () => void;
  onSubmit: (v: string) => void;
}) {
  const [value, setValue] = useState(opts.defaultValue ?? '');
  const [error, setError] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    const problem =
      opts.validate?.(trimmed) ??
      (trimmed.length < (opts.minLength ?? 1)
        ? `اكتب ${opts.minLength ?? 1} حروف على الأقل`
        : null);
    if (problem) return setError(problem);
    onSubmit(trimmed);
  }
  return (
    <Modal
      open
      onClose={onCancel}
      title={opts.title}
      description={opts.description}
      icon={opts.icon}
    >
      <form onSubmit={submit} className="space-y-4">
        {opts.suggestions && (
          <div className="flex flex-wrap gap-2">
            {opts.suggestions.map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => setValue(s)}
                className={cx(
                  'cursor-pointer rounded-full px-3.5 py-1.5 text-sm transition',
                  value === s
                    ? 'bg-ink-900 text-white'
                    : 'bg-ink-100 text-ink-700 hover:bg-ink-200',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <Input
          label={opts.label}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder={opts.placeholder}
          inputMode={opts.inputMode}
          type={opts.type}
          dir={opts.inputMode === 'decimal' || opts.type === 'password' ? 'ltr' : undefined}
          error={error ?? undefined}
        />
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">
          <Button type="submit" variant={opts.danger ? 'danger' : 'primary'}>
            {opts.confirmLabel ?? 'حفظ'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            رجوع
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog outside DialogProvider');
  return ctx;
}
