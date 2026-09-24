import { Camera, LoaderCircle } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { uploadImage } from '../lib/api';
import { useToast } from './toast';
import { cx } from './ui';

/** زرار رفع صورة: بيفتح الكاميرا أو المعرض على الموبايل */
export function ImagePicker({
  path,
  onUploaded,
  children,
  className,
  label = 'تغيير الصورة',
}: {
  path: string;
  onUploaded: (url: string) => void;
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { url } = await uploadImage(path, file);
      onUploaded(url);
      toast('الصورة اتحفظت');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'رفع الصورة فشل', 'error');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      disabled={busy}
      aria-label={label}
      title={label}
      className={cx('relative cursor-pointer', className)}
    >
      {children}
      <span className="absolute end-1 bottom-1 flex size-8 items-center justify-center rounded-full bg-ink-900/80 text-white shadow-lift">
        {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Camera className="size-4" />}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </button>
  );
}
