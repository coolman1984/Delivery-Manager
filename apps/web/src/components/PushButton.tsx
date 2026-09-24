import { useQuery } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { useState } from 'react';
import { enablePush, pushSupported } from '../lib/push';
import { useToast } from './toast';
import { cx } from './ui';

/** زرار "فعّل الإشعارات": بيظهر بس لو الموبايل بيدعمها والسيرفر متظبط */
export function PushButton({ className, dark }: { className?: string; dark?: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const supported = useQuery({
    queryKey: ['push-supported'],
    queryFn: pushSupported,
    staleTime: Infinity,
  });
  const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  if (!supported.data || granted) return null;
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await enablePush().catch(() => 'unsupported' as const);
        setBusy(false);
        toast(
          r === 'ok'
            ? 'الإشعارات اشتغلت'
            : r === 'denied'
              ? 'لازم تسمح بالإشعارات من إعدادات المتصفح'
              : 'الإشعارات مش متاحة',
          r === 'ok' ? 'success' : 'error',
        );
      }}
      className={cx(
        'flex cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium',
        dark
          ? 'bg-white/5 text-ink-300 hover:bg-white/10 hover:text-white'
          : 'bg-sun-100 text-ink-900 hover:bg-sun-200',
        className,
      )}
    >
      <BellRing className="size-4" /> فعّل الإشعارات
    </button>
  );
}
