import { DRIVER_STATUSES, ORDER_STATUSES, ROLES, STORE_TYPES } from '@dm/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * شكل قاعدة البيانات.
 * قاعدة ذهبية: كل جدول فيه tenant_id (ختم الشركة)، وقاعدة البيانات نفسها
 * بتمنع أي استعلام يشوف صفوف شركة تانية (شوف ملف ترحيل rls).
 * كل المبالغ بالقرش كأرقام صحيحة.
 */

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum('role', ROLES);
export const storeTypeEnum = pgEnum('store_type', STORE_TYPES);
export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES);
export const driverStatusEnum = pgEnum('driver_status', DRIVER_STATUSES);
export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended']);
export const paymentMethodEnum = pgEnum('payment_method', ['cash']);
export const cashDiffStatusEnum = pgEnum('cash_diff_status', [
  'none',
  'pending',
  'written_off',
  'charged_driver',
]);
export const ledgerAccountTypeEnum = pgEnum('ledger_account_type', [
  'driver_cash', // فلوس في إيد الطيار ولسه ماسلّمهاش
  'store_payable', // فلوس مستحقة للمحل
  'commission_revenue', // أرباح العمولة
  'delivery_revenue', // أرباح التوصيل
  'company_cash', // خزنة الشركة
  'cash_difference', // فروقات تحصيل مستنية قرار
  'loss', // خسائر اتشطبت
]);
export const journalKindEnum = pgEnum('journal_kind', [
  'order_delivered',
  'driver_settlement',
  'store_payout',
  'cash_diff_write_off',
  'cash_diff_charge_driver',
]);

// ———— الشركات ————
export const tenants = pgTable('tenants', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  governorate: text('governorate').notNull(),
  status: tenantStatusEnum('status').notNull().default('active'),
  createdAt: createdAt(),
});

export const tenantCounters = pgTable(
  'tenant_counters',
  {
    tenantId: tenantId(),
    name: text('name').notNull(),
    value: integer('value').notNull().default(0),
  },
  (t) => [unique('tenant_counters_pk').on(t.tenantId, t.name)],
);

// ———— المناطق ————
export const zones = pgTable(
  'zones',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    deliveryFee: integer('delivery_fee').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [unique('zones_tenant_name').on(t.tenantId, t.name)],
);

// ———— المحلات ————
export const stores = pgTable(
  'stores',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    type: storeTypeEnum('type').notNull(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    address: text('address').notNull(),
    phone: text('phone').notNull(),
    commissionBps: integer('commission_bps').notNull(),
    isOpen: boolean('is_open').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('stores_tenant_idx').on(t.tenantId)],
);

// ———— المستخدمين ————
export const users = pgTable(
  'users',
  {
    id: id(),
    tenantId: tenantId(),
    phone: text('phone').notNull(),
    name: text('name').notNull(),
    role: roleEnum('role').notNull(),
    passwordHash: text('password_hash'),
    storeId: uuid('store_id').references(() => stores.id),
    isActive: boolean('is_active').notNull().default(true),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    failedLoginCount: integer('failed_login_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('users_tenant_phone').on(t.tenantId, t.phone)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    familyId: uuid('family_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('refresh_tokens_family_idx').on(t.familyId)],
);

export const addresses = pgTable(
  'addresses',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    label: text('label').notNull(),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    details: text('details').notNull(),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    isDeleted: boolean('is_deleted').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('addresses_user_idx').on(t.userId)],
);

export const driverProfiles = pgTable('driver_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  tenantId: tenantId(),
  status: driverStatusEnum('status').notNull().default('offline'),
  lastLat: doublePrecision('last_lat'),
  lastLng: doublePrecision('last_lng'),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  // الرقم القومي متخزن متشفر، ومحدش يشوفه كامل
  nationalIdEnc: text('national_id_enc'),
});

// ———— المنتجات ————
export const products = pgTable(
  'products',
  {
    id: id(),
    tenantId: tenantId(),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    name: text('name').notNull(),
    description: text('description'),
    category: text('category'),
    price: integer('price').notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('products_store_idx').on(t.storeId)],
);

// ———— الطلبات ————
export const orders = pgTable(
  'orders',
  {
    id: id(),
    tenantId: tenantId(),
    number: integer('number').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => users.id),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id),
    driverId: uuid('driver_id').references(() => users.id),
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    // نسخة من العنوان وقت الطلب، عشان لو العميل عدّل عنوانه بعدين التاريخ مايتغيرش
    addressText: text('address_text').notNull(),
    customerPhone: text('customer_phone').notNull(),
    customerName: text('customer_name').notNull(),
    status: orderStatusEnum('status').notNull().default('placed'),
    paymentMethod: paymentMethodEnum('payment_method').notNull().default('cash'),
    subtotal: integer('subtotal').notNull(),
    deliveryFee: integer('delivery_fee').notNull(),
    discount: integer('discount').notNull().default(0),
    total: integer('total').notNull(),
    commissionBps: integer('commission_bps').notNull(),
    commissionAmount: integer('commission_amount').notNull(),
    cashCollected: integer('cash_collected'),
    cashDiffStatus: cashDiffStatusEnum('cash_diff_status').notNull().default('none'),
    note: text('note'),
    reason: text('reason'),
    placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    readyAt: timestamp('ready_at', { withTimezone: true }),
    assignedAt: timestamp('assigned_at', { withTimezone: true }),
    pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('orders_tenant_number').on(t.tenantId, t.number),
    unique('orders_idempotency').on(t.tenantId, t.customerId, t.clientRequestId),
    index('orders_tenant_status_idx').on(t.tenantId, t.status),
    index('orders_store_idx').on(t.storeId, t.status),
    index('orders_driver_idx').on(t.driverId, t.status),
    index('orders_customer_idx').on(t.customerId),
    index('orders_placed_at_idx').on(t.tenantId, t.placedAt),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    tenantId: tenantId(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    name: text('name').notNull(),
    unitPrice: integer('unit_price').notNull(),
    quantity: smallint('quantity').notNull(),
    lineTotal: integer('line_total').notNull(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId)],
);

/** كل تغيير في حالة الطلب: مين عمله وإمتى */
export const orderEvents = pgTable(
  'order_events',
  {
    id: id(),
    tenantId: tenantId(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    type: text('type').notNull(),
    fromStatus: orderStatusEnum('from_status'),
    toStatus: orderStatusEnum('to_status'),
    actorId: uuid('actor_id').references(() => users.id),
    note: text('note'),
    createdAt: createdAt(),
  },
  (t) => [index('order_events_order_idx').on(t.orderId)],
);

export const ratings = pgTable('ratings', {
  orderId: uuid('order_id')
    .primaryKey()
    .references(() => orders.id),
  tenantId: tenantId(),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => users.id),
  storeId: uuid('store_id')
    .notNull()
    .references(() => stores.id),
  driverId: uuid('driver_id').references(() => users.id),
  storeRating: smallint('store_rating').notNull(),
  driverRating: smallint('driver_rating'),
  comment: text('comment'),
  createdAt: createdAt(),
});

// ———— دفتر الحسابات (قيد مزدوج) ————
export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: id(),
    tenantId: tenantId(),
    type: ledgerAccountTypeEnum('type').notNull(),
    // الطيار أو المحل صاحب الحساب (فاضي لحسابات الشركة العامة)
    ownerId: uuid('owner_id'),
    createdAt: createdAt(),
  },
  (t) => [unique('ledger_accounts_owner').on(t.tenantId, t.type, t.ownerId).nullsNotDistinct()],
);

/** القيد: عملية مالية واحدة، ممنوع يتعدل أو يتمسح */
export const journals = pgTable(
  'journals',
  {
    id: id(),
    tenantId: tenantId(),
    kind: journalKindEnum('kind').notNull(),
    refId: uuid('ref_id').notNull(),
    description: text('description').notNull(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    // نفس العملية ماتتسجلش مرتين (مثلاً: تحصيل نفس الطلب)
    uniqueIndex('journals_idempotency')
      .on(t.tenantId, t.kind, t.refId)
      .where(sql`kind in ('order_delivered', 'cash_diff_write_off', 'cash_diff_charge_driver')`),
    index('journals_created_idx').on(t.tenantId, t.createdAt),
  ],
);

/** سطور القيد: موجب = مدين، سالب = دائن. مجموع سطور كل قيد لازم = صفر */
export const ledgerLines = pgTable(
  'ledger_lines',
  {
    id: id(),
    tenantId: tenantId(),
    journalId: uuid('journal_id')
      .notNull()
      .references(() => journals.id),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('ledger_lines_account_idx').on(t.accountId),
    index('ledger_lines_journal_idx').on(t.journalId),
  ],
);

/** تسوية عهدة الطيار: المفروض يسلّم كام، وسلّم كام فعلاً */
export const settlements = pgTable(
  'settlements',
  {
    id: id(),
    tenantId: tenantId(),
    driverId: uuid('driver_id')
      .notNull()
      .references(() => users.id),
    expectedAmount: integer('expected_amount').notNull(),
    receivedAmount: integer('received_amount').notNull(),
    shortage: integer('shortage').notNull(),
    journalId: uuid('journal_id').references(() => journals.id),
    note: text('note'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('settlements_driver_idx').on(t.driverId, t.createdAt)],
);

// ———— سجل العمليات الحساسة ————
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    tenantId: tenantId(),
    actorId: uuid('actor_id'),
    actorRole: text('actor_role'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    meta: jsonb('meta'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_tenant_created_idx').on(t.tenantId, t.createdAt)],
);
