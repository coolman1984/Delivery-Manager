import type { StoreType } from '@dm/shared';
import { Pill, ShoppingBasket, Store, Utensils, type LucideIcon } from 'lucide-react';

/** شكل كل نوع محل: أيقونة ولون، عشان المحلات تبان مميزة حتى من غير صور */
export const STORE_VISUAL: Record<
  StoreType,
  { icon: LucideIcon; label: string; cover: string; tile: string; iconColor: string }
> = {
  restaurant: {
    icon: Utensils,
    label: 'مطاعم',
    cover: 'from-brand-500 to-amber-400',
    tile: 'bg-brand-50',
    iconColor: 'text-brand-600',
  },
  pharmacy: {
    icon: Pill,
    label: 'صيدليات',
    cover: 'from-sky-500 to-cyan-400',
    tile: 'bg-sky-50',
    iconColor: 'text-sky-600',
  },
  grocery: {
    icon: ShoppingBasket,
    label: 'سوبر ماركت',
    cover: 'from-emerald-500 to-lime-400',
    tile: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
  },
  other: {
    icon: Store,
    label: 'محلات تانية',
    cover: 'from-violet-500 to-fuchsia-400',
    tile: 'bg-violet-50',
    iconColor: 'text-violet-600',
  },
};
