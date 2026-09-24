import type { StoreType } from '@dm/shared';
import { useState } from 'react';
import { art, STORE_VISUAL } from '../lib/visuals';
import { cx } from './ui';

const LOGO_COLORS = [
  'from-orange-500 to-red-500',
  'from-brand-500 to-brand-700',
  'from-sky-500 to-blue-600',
  'from-violet-500 to-purple-600',
  'from-pink-500 to-rose-600',
  'from-amber-400 to-orange-500',
  'from-teal-500 to-cyan-600',
];

function hash(s: string): number {
  return [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
}

/** لوجو المحل: صورته لو موجودة، وإلا لوجو ملوّن بأول حرف من اسمه */
export function StoreLogo({
  name,
  url,
  className = 'size-14',
}: {
  name: string;
  url?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cx(
          'shrink-0 rounded-2xl bg-white object-cover ring-1 ring-ink-200/70',
          className,
        )}
      />
    );
  }
  const word = name
    .replace(/^(مطعم|صيدلية|سوبر ماركت|ماركت|حلواني|كشري|مشويات|بيتزا|سندوتشات|فطاطري)\s+/, '')
    .replace(/^ال(?=\S{2})/, '');
  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-card ring-2 ring-white',
        LOGO_COLORS[hash(name) % LOGO_COLORS.length],
        className,
      )}
      aria-hidden
    >
      <span className="text-[1.4em] leading-none font-extrabold">{word.charAt(0)}</span>
    </div>
  );
}

const COVER_ART: Record<StoreType, string[]> = {
  restaurant: ['hamburger', 'fries', 'drink'],
  grocery: ['basket', 'milk', 'apple'],
  pharmacy: ['pill', 'lotion', 'bandage'],
  other: ['gift', 'cookie', 'icecream'],
};

/** غلاف المحل: صورته لو موجودة، وإلا لوحة ملونة فيها رسومات من نوع المحل */
export function StoreCover({
  type,
  url,
  closed,
  className = 'h-36',
}: {
  type: StoreType;
  url?: string | null;
  closed?: boolean;
  className?: string;
}) {
  const v = STORE_VISUAL[type];
  const [a, b, c] = COVER_ART[type];
  return (
    <div
      className={cx(
        'relative overflow-hidden bg-gradient-to-br',
        v.cover,
        closed && 'grayscale',
        className,
      )}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <>
          <div className="absolute -top-10 -right-10 size-40 rounded-full bg-white/40" />
          <div className="absolute -bottom-16 left-10 size-44 rounded-full bg-white/30" />
          <img
            src={art(a!)}
            alt=""
            loading="lazy"
            className="absolute top-1/2 left-6 size-24 -translate-y-1/2 -rotate-6 drop-shadow-xl"
          />
          <img
            src={art(b!)}
            alt=""
            loading="lazy"
            className="absolute top-3 left-32 size-14 rotate-12 drop-shadow-lg"
          />
          <img
            src={art(c!)}
            alt=""
            loading="lazy"
            className="absolute bottom-2 left-32 size-12 -rotate-12 drop-shadow-lg"
          />
        </>
      )}
      {closed && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-900/45">
          <span className="rounded-full bg-white px-4 py-1.5 text-sm font-bold text-ink-900">
            مقفول دلوقتي
          </span>
        </div>
      )}
    </div>
  );
}

/** صورة المنتج: صورة حقيقية أو رسمة ثلاثية الأبعاد على خلفية ناعمة */
export function ProductImage({
  url,
  name,
  className = 'size-24',
}: {
  url?: string | null;
  name: string;
  className?: string;
}) {
  const isArt = !url || url.startsWith('/art/');
  return (
    <div className={cx('relative shrink-0 overflow-hidden rounded-2xl bg-[#f3efe6]', className)}>
      <img
        src={url ?? art('takeout')}
        alt={name}
        loading="lazy"
        className={cx('size-full', isArt ? 'object-contain p-3 drop-shadow-md' : 'object-cover')}
      />
    </div>
  );
}

export function Art({ name, className = 'size-16' }: { name: string; className?: string }) {
  return <img src={art(name)} alt="" loading="lazy" className={cx('drop-shadow-md', className)} />;
}
