export const ROLES = ['customer', 'store', 'driver', 'ops', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  customer: 'عميل',
  store: 'محل',
  driver: 'طيار',
  ops: 'مدير تشغيل',
  admin: 'مدير الشركة',
};

/** الأدوار اللي بتدخل بكلمة سر (الموظفين) */
export const STAFF_ROLES: readonly Role[] = ['store', 'driver', 'ops', 'admin'];

/** الأدوار اللي ليها صلاحيات لوحة التشغيل */
export const OPS_ROLES: readonly Role[] = ['ops', 'admin'];

export const STORE_TYPES = ['restaurant', 'pharmacy', 'grocery', 'other'] as const;
export type StoreType = (typeof STORE_TYPES)[number];

export const STORE_TYPE_LABELS: Record<StoreType, string> = {
  restaurant: 'مطعم',
  pharmacy: 'صيدلية',
  grocery: 'بقالة وسوبر ماركت',
  other: 'محلات تانية',
};

export const DRIVER_STATUSES = ['offline', 'available', 'busy'] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const DRIVER_STATUS_LABELS: Record<DriverStatus, string> = {
  offline: 'مش شغال',
  available: 'متاح',
  busy: 'في مشوار',
};
