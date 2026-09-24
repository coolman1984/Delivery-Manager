import { ROLE_LABELS, STORE_TYPE_LABELS, STORE_TYPES, type Role, type StoreType } from '@dm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useToast } from '../../components/toast';
import { Button, Card, ErrorBox, Input, Loading, PageTitle, Select } from '../../components/ui';
import { get, patch, post } from '../../lib/api';
import { dateTime, money, toPiasters } from '../../lib/format';
import type { Zone } from '../../lib/types';

interface AdminStore {
  id: string;
  name: string;
  type: StoreType;
  zoneId: string;
  commissionBps: number;
  isActive: boolean;
}
interface AdminUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  isActive: boolean;
}
interface AuditRow {
  id: string;
  action: string;
  actorName: string | null;
  actorRole: string | null;
  ip: string | null;
  createdAt: string;
}

const TABS = [
  { id: 'zones', label: '📍 المناطق' },
  { id: 'stores', label: '🏪 المحلات' },
  { id: 'users', label: '👥 الموظفين' },
  { id: 'audit', label: '🕵️ سجل العمليات' },
] as const;

export default function Admin() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('zones');
  return (
    <div>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm ${tab === t.id ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-slate-300'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'zones' && <Zones />}
      {tab === 'stores' && <Stores />}
      {tab === 'users' && <Users />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}

function useSaver(key: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return {
    onSuccess: () => {
      toast('اتحفظ ✅');
      void queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  };
}

function Zones() {
  const zones = useQuery({ queryKey: ['admin-zones'], queryFn: () => get<Zone[]>('/admin/zones') });
  const saver = useSaver('admin-zones');
  const update = useMutation({
    mutationFn: (v: { id: string; body: Partial<Zone> }) => patch(`/admin/zones/${v.id}`, v.body),
    ...saver,
  });
  const [name, setName] = useState('');
  const [fee, setFee] = useState('');
  const create = useMutation({
    mutationFn: () => post('/admin/zones', { name, deliveryFee: toPiasters(fee) }),
    ...saver,
  });

  if (zones.isPending) return <Loading />;
  if (zones.error) return <ErrorBox error={zones.error} />;
  return (
    <div className="space-y-4">
      <PageTitle>المناطق وأسعار التوصيل</PageTitle>
      <div className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
        {zones.data.map((z) => (
          <div key={z.id} className="tabular flex items-center gap-3 p-3">
            <span
              className={`flex-1 font-medium ${z.isActive ? '' : 'text-slate-400 line-through'}`}
            >
              {z.name}
            </span>
            <button
              className="rounded-lg px-2 py-1 font-semibold text-brand-700 hover:bg-brand-50"
              onClick={() => {
                const v = prompt(`سعر التوصيل لـ ${z.name} بالجنيه:`, String(z.deliveryFee / 100));
                const p = v ? toPiasters(v) : NaN;
                if (Number.isInteger(p)) update.mutate({ id: z.id, body: { deliveryFee: p } });
              }}
            >
              {money(z.deliveryFee)} ✏️
            </button>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-brand-600"
                checked={z.isActive}
                onChange={(e) => update.mutate({ id: z.id, body: { isActive: e.target.checked } })}
              />
              شغالة
            </label>
          </div>
        ))}
      </div>
      <Card>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input
            label="منطقة جديدة"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
          <Input
            label="سعر التوصيل بالجنيه"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            required
          />
          <Button type="submit" loading={create.isPending} className="self-end">
            إضافة
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Stores() {
  const stores = useQuery({
    queryKey: ['admin-stores'],
    queryFn: () => get<AdminStore[]>('/admin/stores'),
  });
  const zones = useQuery({ queryKey: ['admin-zones'], queryFn: () => get<Zone[]>('/admin/zones') });
  const saver = useSaver('admin-stores');
  const update = useMutation({
    mutationFn: (v: { id: string; body: Partial<AdminStore> }) =>
      patch(`/admin/stores/${v.id}`, v.body),
    ...saver,
  });
  const [form, setForm] = useState({
    name: '',
    type: 'restaurant' as StoreType,
    zoneId: '',
    address: '',
    phone: '',
    commission: '10',
  });
  const create = useMutation({
    mutationFn: () =>
      post('/admin/stores', {
        name: form.name,
        type: form.type,
        zoneId: form.zoneId,
        address: form.address,
        phone: form.phone,
        commissionBps: Math.round(Number(form.commission) * 100),
      }),
    ...saver,
  });

  if (stores.isPending) return <Loading />;
  if (stores.error) return <ErrorBox error={stores.error} />;
  return (
    <div className="space-y-4">
      <PageTitle>المحلات والعمولات</PageTitle>
      <div className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
        {stores.data.map((s) => (
          <div key={s.id} className="tabular flex flex-wrap items-center gap-3 p-3">
            <div className="flex-1">
              <div className={`font-medium ${s.isActive ? '' : 'text-slate-400 line-through'}`}>
                {s.name}
              </div>
              <div className="text-xs text-slate-500">{STORE_TYPE_LABELS[s.type]}</div>
            </div>
            <button
              className="rounded-lg px-2 py-1 font-semibold text-brand-700 hover:bg-brand-50"
              onClick={() => {
                const v = prompt(`نسبة عمولة ${s.name} (٪):`, String(s.commissionBps / 100));
                const bps = v ? Math.round(Number(v) * 100) : NaN;
                if (Number.isInteger(bps) && bps >= 0 && bps <= 5000)
                  update.mutate({ id: s.id, body: { commissionBps: bps } });
              }}
            >
              عمولة {s.commissionBps / 100}٪ ✏️
            </button>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-brand-600"
                checked={s.isActive}
                onChange={(e) => update.mutate({ id: s.id, body: { isActive: e.target.checked } })}
              />
              شغال
            </label>
          </div>
        ))}
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">محل جديد</h2>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input
            label="الاسم"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Select
            label="النوع"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as StoreType })}
          >
            {STORE_TYPES.map((t) => (
              <option key={t} value={t}>
                {STORE_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
          <Select
            label="المنطقة"
            value={form.zoneId}
            onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
            required
          >
            <option value="">اختار</option>
            {zones.data?.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </Select>
          <Input
            label="العنوان"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            required
          />
          <Input
            label="تليفون المحل"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            inputMode="tel"
            dir="ltr"
            required
          />
          <Input
            label="العمولة ٪"
            value={form.commission}
            onChange={(e) => setForm({ ...form, commission: e.target.value })}
            inputMode="decimal"
            dir="ltr"
            required
          />
          {create.error && (
            <div className="sm:col-span-2">
              <ErrorBox error={create.error} />
            </div>
          )}
          <Button type="submit" loading={create.isPending} className="sm:col-span-2">
            إضافة المحل
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Users() {
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => get<AdminUser[]>('/admin/users'),
  });
  const stores = useQuery({
    queryKey: ['admin-stores'],
    queryFn: () => get<AdminStore[]>('/admin/stores'),
  });
  const saver = useSaver('admin-users');
  const update = useMutation({
    mutationFn: (v: { id: string; body: { isActive?: boolean; password?: string } }) =>
      patch(`/admin/users/${v.id}`, v.body),
    ...saver,
  });
  const [form, setForm] = useState({
    name: '',
    phone: '',
    role: 'driver' as Exclude<Role, 'customer'>,
    password: '',
    storeId: '',
  });
  const create = useMutation({
    mutationFn: () =>
      post('/admin/users', { ...form, storeId: form.role === 'store' ? form.storeId : undefined }),
    ...saver,
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  if (users.isPending) return <Loading />;
  if (users.error) return <ErrorBox error={users.error} />;
  return (
    <div className="space-y-4">
      <PageTitle>حسابات الموظفين</PageTitle>
      <div className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
        {users.data.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-3">
            <div className="flex-1">
              <div className={`font-medium ${u.isActive ? '' : 'text-slate-400 line-through'}`}>
                {u.name}
              </div>
              <div className="text-xs text-slate-500">
                <span dir="ltr">{u.phone}</span> · {ROLE_LABELS[u.role]}
              </div>
            </div>
            <button
              className="text-sm text-brand-700 underline"
              onClick={() => {
                const password = prompt(`كلمة سر جديدة لـ ${u.name} (١٠ حروف على الأقل):`);
                if (password && password.length >= 10)
                  update.mutate({ id: u.id, body: { password } });
              }}
            >
              كلمة سر جديدة
            </button>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-brand-600"
                checked={u.isActive}
                onChange={(e) => update.mutate({ id: u.id, body: { isActive: e.target.checked } })}
              />
              شغال
            </label>
          </div>
        ))}
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">حساب جديد</h2>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <Input
            label="الاسم"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="الموبايل"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            inputMode="tel"
            dir="ltr"
            required
          />
          <Select
            label="الدور"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}
          >
            {(['driver', 'store', 'ops', 'admin'] as const).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          {form.role === 'store' && (
            <Select
              label="المحل"
              value={form.storeId}
              onChange={(e) => setForm({ ...form, storeId: e.target.value })}
              required
            >
              <option value="">اختار</option>
              {stores.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
          <Input
            label="كلمة السر (١٠ حروف على الأقل)"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            minLength={10}
            required
            dir="ltr"
          />
          {create.error && (
            <div className="sm:col-span-2">
              <ErrorBox error={create.error} />
            </div>
          )}
          <Button type="submit" loading={create.isPending} className="sm:col-span-2">
            إنشاء الحساب
          </Button>
        </form>
      </Card>
    </div>
  );
}

const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'دخول',
  'auth.login_failed': 'محاولة دخول فاشلة',
  'auth.account_locked': 'قفل حساب بسبب محاولات غلط',
  'auth.refresh_reuse_detected': '🚨 محاولة استخدام جلسة مسروقة',
  'auth.login_otp': 'دخول عميل بالكود',
  'auth.register': 'تسجيل عميل جديد',
  'order.placed': 'طلب جديد',
  'order.accepted': 'قبول طلب',
  'order.rejected': 'رفض طلب',
  'order.ready': 'طلب جاهز',
  'order.assigned': 'إسناد لطيار',
  'order.picked_up': 'استلام الطيار',
  'order.delivered': 'تسليم وتحصيل',
  'order.cancelled': 'إلغاء طلب',
  'finance.driver_settled': 'تسوية عهدة طيار',
  'finance.store_payout': 'صرف لمحل',
  'finance.cash_diff_write_off': 'شطب فرق تحصيل',
  'finance.cash_diff_charge_driver': 'تحميل فرق على طيار',
  'product.updated': 'تعديل منتج',
  'product.created': 'منتج جديد',
  'zone.updated': 'تعديل منطقة',
  'store.updated': 'تعديل محل',
  'user.created': 'حساب جديد',
  'user.updated': 'تعديل حساب',
  'user.password_reset': 'تعيين كلمة سر جديدة لموظف',
  'auth.password_changed': 'تغيير كلمة السر',
  'auth.password_change_failed': 'محاولة فاشلة لتغيير كلمة السر',
};

function Audit() {
  const logs = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => get<AuditRow[]>('/admin/audit-logs?limit=200'),
  });
  if (logs.isPending) return <Loading />;
  if (logs.error) return <ErrorBox error={logs.error} />;
  return (
    <div>
      <PageTitle>سجل العمليات الحساسة</PageTitle>
      <p className="mb-3 text-sm text-slate-500">
        كل عملية مهمة متسجلة هنا، ومحدش يقدر يعدّل أو يمسح منها حاجة.
      </p>
      <div className="divide-y divide-slate-100 rounded-2xl bg-white text-sm ring-1 ring-slate-200">
        {logs.data.map((l) => (
          <div key={l.id} className="flex flex-wrap gap-x-3 p-3">
            <span className="tabular text-slate-500">{dateTime(l.createdAt)}</span>
            <b>{ACTION_LABELS[l.action] ?? l.action}</b>
            <span>
              {l.actorName ?? 'غير معروف'}
              {l.actorRole ? ` (${ROLE_LABELS[l.actorRole as Role] ?? l.actorRole})` : ''}
            </span>
            <span className="text-slate-400" dir="ltr">
              {l.ip}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
