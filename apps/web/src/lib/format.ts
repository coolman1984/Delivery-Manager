export { formatEGP as money } from '@dm/shared';

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
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}

/** من خانة بالجنيه (ممكن فيها كسور) لقروش */
export function toPiasters(value: string): number {
  const normalized = value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace('٫', '.');
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}
