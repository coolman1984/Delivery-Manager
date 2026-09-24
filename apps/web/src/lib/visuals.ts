import type { StoreType } from '@dm/shared';
import { Pill, ShoppingBasket, Store, Utensils, type LucideIcon } from 'lucide-react';

/** رسمة ثلاثية الأبعاد من مكتبة Fluent Emoji (رخصة MIT) */
export const art = (key: string) => `/art/${key}.webp`;

/** شكل كل نوع محل: رسمة وأيقونة ولون، عشان المحلات تبان مميزة حتى من غير صور */
export const STORE_VISUAL: Record<
  StoreType,
  { icon: LucideIcon; art: string; label: string; cover: string; tile: string; iconColor: string }
> = {
  restaurant: {
    icon: Utensils,
    art: 'hamburger',
    label: 'مطاعم',
    cover: 'from-orange-200 via-amber-100 to-sun-100',
    tile: 'bg-orange-50',
    iconColor: 'text-orange-600',
  },
  pharmacy: {
    icon: Pill,
    art: 'pill',
    label: 'صيدليات',
    cover: 'from-sky-200 via-cyan-100 to-sky-50',
    tile: 'bg-sky-50',
    iconColor: 'text-sky-600',
  },
  grocery: {
    icon: ShoppingBasket,
    art: 'basket',
    label: 'سوبر ماركت',
    cover: 'from-brand-200 via-lime-100 to-brand-50',
    tile: 'bg-brand-50',
    iconColor: 'text-brand-600',
  },
  other: {
    icon: Store,
    art: 'gift',
    label: 'حلويات وأكتر',
    cover: 'from-pink-200 via-rose-100 to-pink-50',
    tile: 'bg-pink-50',
    iconColor: 'text-pink-600',
  },
};

/** الوقت المتوقع للتوصيل: وقت التحضير + وقت المشوار */
export function eta(prepMinutes = 20): string {
  const from = prepMinutes + 10;
  const to = prepMinutes + 25;
  return `${from.toLocaleString('ar-EG')}-${to.toLocaleString('ar-EG')} د`;
}
