export { formatEGP as money } from '@dm/shared';

/** كل الأرقام اللي بتظهر للمستخدم بالأرقام العربية */
export function num(n: number): string {
  return n.toLocaleString('ar-EG');
}

export function orderNo(n: number): string {
  return `#${num(n)}`;
}

export function time(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
}

export function dateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ar-EG', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function minutesSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
}

export function ago(iso: string | null): string {
  if (!iso) return 'مفيش';
  const m = minutesSince(iso);
  if (m < 1) return 'دلوقتي';
  if (m < 60) return `من ${num(m)} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `من ${num(h)} ساعة`;
  return dateTime(iso);
}

/** من خانة بالجنيه (ممكن فيها كسور أو أرقام عربي) لقروش */
export function toPiasters(value: string): number {
  const normalized = value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace('٫', '.')
    .trim();
  if (normalized === '') return NaN;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}

export function todayCairo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
}

export function greeting(): string {
  const h = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Cairo',
      hour: 'numeric',
      hour12: false,
    }).format(new Date()),
  );
  if (h < 12) return 'صباح الخير';
  if (h < 18) return 'نهارك سعيد';
  return 'مساء الخير';
}
