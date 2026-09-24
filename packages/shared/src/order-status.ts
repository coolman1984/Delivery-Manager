import type { Role } from './roles';

/**
 * دورة حياة الطلب:
 * placed (اتطلب) ← accepted (المحل قبل وبيحضّر) ← ready (جاهز) ← picked_up (مع الطيار) ← delivered (اتسلم)
 * ومن أي مرحلة قبل التسليم ممكن يترفض أو يتلغي حسب الدور.
 */
export const ORDER_STATUSES = [
  'placed',
  'accepted',
  'ready',
  'picked_up',
  'delivered',
  'rejected',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'مستني قبول المحل',
  accepted: 'بيتحضّر',
  ready: 'جاهز للاستلام',
  picked_up: 'مع الطيار في الطريق',
  delivered: 'اتسلّم',
  rejected: 'المحل رفضه',
  cancelled: 'اتلغى',
};

export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'placed',
  'accepted',
  'ready',
  'picked_up',
];

export const FINAL_ORDER_STATUSES: readonly OrderStatus[] = ['delivered', 'rejected', 'cancelled'];

type TransitionRule = { to: OrderStatus; roles: readonly Role[] };

const TRANSITIONS: Record<OrderStatus, readonly TransitionRule[]> = {
  placed: [
    { to: 'accepted', roles: ['store'] },
    { to: 'rejected', roles: ['store'] },
    { to: 'cancelled', roles: ['customer', 'ops', 'admin'] },
  ],
  accepted: [
    { to: 'ready', roles: ['store'] },
    { to: 'cancelled', roles: ['ops', 'admin'] },
  ],
  ready: [
    { to: 'picked_up', roles: ['driver'] },
    { to: 'cancelled', roles: ['ops', 'admin'] },
  ],
  picked_up: [
    { to: 'delivered', roles: ['driver'] },
    { to: 'cancelled', roles: ['ops', 'admin'] },
  ],
  delivered: [],
  rejected: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus, role: Role): boolean {
  return TRANSITIONS[from].some((rule) => rule.to === to && rule.roles.includes(role));
}

/** إمتى ينفع مدير التشغيل يسند الطلب لطيار أو يغيّر الطيار */
export const ASSIGNABLE_STATUSES: readonly OrderStatus[] = ['placed', 'accepted', 'ready'];

export function isAssignable(status: OrderStatus): boolean {
  return ASSIGNABLE_STATUSES.includes(status);
}
