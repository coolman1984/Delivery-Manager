import { ROLE_LABELS, STORE_TYPE_LABELS, STORE_TYPES, type Role, type StoreType } from '@dm/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  KeyRound,
  MapPin,
  Pencil,
  Percent,
  Plus,
  ScrollText,
  Store,
  UserPlus,
  Users,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Modal, useDialog } from '../../components/dialog';
import { useToast } from '../../components/toast';
import {
  Avatar,
  Badge,
  Button,
  Card,
  cx,
  ErrorBox,
  Input,
  Money,
  PageHeader,
  Segmented,
  Select,
  SkeletonList,
  Switch,
} from '../../components/ui';
import { get, patch, post } from '../../lib/api';
import { dateTime, num, toPiasters } from '../../lib/format';
import type { Zone } from '../../lib/types';
import { ImagePicker } from '../../components/ImagePicker';
import { StoreLogo } from '../../components/visual';

interface AdminStore {
  id: string;
  logoUrl: string | null;
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

type Tab = 'zones' | 'stores' | 'users' | 'leads' | 'audit';

export default function Admin() {
  const [tab, setTab] = useState<Tab>('zones');
  return (
    <div>
      <PageHeader
        title="الإدارة"
        subtitle="المناطق والأسعار، المحلات والعمولات، والموظفين. كل تعديل بيتسجل."
      />
      <Segmented
        className="mb-6"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'zones', label: 'المناطق' },
          { value: 'stores', label: 'المحلات' },
          { value: 'users', label: 'الموظفين' },
          { value: 'leads', label: 'طلبات الانضمام' },
          { value: 'audit', label: 'سجل العمليات' },
        ]}
      />
      {tab === 'zones' && <Zones />}
      {tab === 'stores' && <Stores />}
      {tab === 'users' && <UsersTab />}
      {tab === 'leads' && <Leads />}
      {tab === 'audit' && <Audit />}
    </div>
  );
}

function useSaver(key: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return {
    onSuccess: () => {
      toast('اتحفظ');
      void queryClient.invalidateQueries({ queryKey: [key] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  };
}

function TableCard({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: typeof MapPin;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card padded={false}>
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-4">
        <h2 className="flex items-center gap-2 font-bold">
          <Icon className="size-5 text-brand-600" /> {title}
        </h2>
        {action}
      </div>
      <div className="divide-y divide-ink-100">{children}</div>
    </Card>
  );
}

// ———— المناطق ————
function Zones() {
  const zones = useQuery({ queryKey: ['admin-zones'], queryFn: () => get<Zone[]>('/admin/zones') });
  const saver = useSaver('admin-zones');
  const dialog = useDialog();
  const update = useMutation({
    mutationFn: (v: { id: string; body: Partial<Zone> }) => patch(`/admin/zones/${v.id}`, v.body),
    ...saver,
  });
  const create = useMutation({
    mutationFn: (body: { name: string; deliveryFee: number }) => post('/admin/zones', body),
    ...saver,
  });

  const priceValidator = (v: string) => (Number.isInteger(toPiasters(v)) ? null : 'اكتب سعر صحيح');

  async function addZone() {
    const name = await dialog.prompt({
      title: 'منطقة جديدة',
      label: 'اسم المنطقة',
      minLength: 2,
      icon: MapPin,
      confirmLabel: 'التالي',
    });
    if (!name) return;
    const fee = await dialog.prompt({
      title: `سعر التوصيل لـ ${name}`,
      label: 'السعر بالجنيه',
      inputMode: 'decimal',
      icon: MapPin,
      validate: priceValidator,
      confirmLabel: 'إضافة',
    });
    if (fee) create.mutate({ name, deliveryFee: toPiasters(fee) });
  }

  async function editFee(z: Zone) {
    const fee = await dialog.prompt({
      title: `سعر التوصيل لـ ${z.name}`,
      label: 'السعر بالجنيه',
      defaultValue: String(z.deliveryFee / 100),
      inputMode: 'decimal',
      icon: MapPin,
      validate: priceValidator,
    });
    if (fee) update.mutate({ id: z.id, body: { deliveryFee: toPiasters(fee) } });
  }

  if (zones.isPending) return <SkeletonList count={4} className="h-14" />;
  if (zones.error) return <ErrorBox error={zones.error} />;
  return (
    <TableCard
      title="المناطق وأسعار التوصيل"
      icon={MapPin}
      action={
        <Button size="sm" icon={Plus} onClick={() => void addZone()}>
          منطقة
        </Button>
      }
    >
      {zones.data.map((z) => (
        <div key={z.id} className="flex items-center gap-4 px-5 py-3.5">
          <span className={cx('flex-1 font-medium', !z.isActive && 'text-ink-400 line-through')}>
            {z.name}
          </span>
          <button
            onClick={() => void editFee(z)}
            className="group flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 font-bold hover:bg-brand-50 hover:text-brand-700"
          >
            <Money value={z.deliveryFee} />{' '}
            <Pencil className="size-3.5 text-ink-300 group-hover:text-brand-600" />
          </button>
          <Switch
            checked={z.isActive ?? true}
            onChange={(v) => update.mutate({ id: z.id, body: { isActive: v } })}
            label={`${z.name} شغالة`}
          />
        </div>
      ))}
    </TableCard>
  );
}

// ———— المحلات ————
function Stores() {
  const queryClient = useQueryClient();
  const stores = useQuery({
    queryKey: ['admin-stores'],
    queryFn: () => get<AdminStore[]>('/admin/stores'),
  });
  const saver = useSaver('admin-stores');
  const dialog = useDialog();
  const [adding, setAdding] = useState(false);
  const update = useMutation({
    mutationFn: (v: { id: string; body: Partial<AdminStore> }) =>
      patch(`/admin/stores/${v.id}`, v.body),
    ...saver,
  });

  async function editCommission(s: AdminStore) {
    const value = await dialog.prompt({
      title: `عمولة ${s.name}`,
      description: 'النسبة اللي المنصة بتاخدها من قيمة المنتجات في كل طلب',
      label: 'النسبة ٪',
      defaultValue: String(s.commissionBps / 100),
      inputMode: 'decimal',
      icon: Percent,
      validate: (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 && n <= 50 ? null : 'من ٠ لـ ٥٠٪';
      },
    });
    if (value)
      update.mutate({ id: s.id, body: { commissionBps: Math.round(Number(value) * 100) } });
  }

  if (stores.isPending) return <SkeletonList count={4} className="h-16" />;
  if (stores.error) return <ErrorBox error={stores.error} />;
  return (
    <>
      <TableCard
        title="المحلات والعمولات"
        icon={Store}
        action={
          <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
            محل
          </Button>
        }
      >
        {stores.data.map((s) => {
          return (
            <div key={s.id} className="flex items-center gap-4 px-5 py-3.5">
              <ImagePicker
                path={`/admin/stores/${s.id}/logo`}
                label={`لوجو ${s.name}`}
                onUploaded={() =>
                  void queryClient.invalidateQueries({ queryKey: ['admin-stores'] })
                }
              >
                <StoreLogo name={s.name} url={s.logoUrl} className="size-12 text-lg" />
              </ImagePicker>
              <div className="min-w-0 flex-1">
                <div className={cx('font-medium', !s.isActive && 'text-ink-400 line-through')}>
                  {s.name}
                </div>
                <div className="text-xs text-ink-500">{STORE_TYPE_LABELS[s.type]}</div>
              </div>
              <button
                onClick={() => void editCommission(s)}
                className="group flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold hover:bg-brand-50 hover:text-brand-700"
              >
                <span className="tabular">{num(s.commissionBps / 100)}٪</span>
                <Pencil className="size-3.5 text-ink-300 group-hover:text-brand-600" />
              </button>
              <Switch
                checked={s.isActive}
                onChange={(val) => update.mutate({ id: s.id, body: { isActive: val } })}
                label={`${s.name} شغال`}
              />
            </div>
          );
        })}
      </TableCard>
      <NewStoreModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function NewStoreModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const zones = useQuery({
    queryKey: ['admin-zones'],
    queryFn: () => get<Zone[]>('/admin/zones'),
    enabled: open,
  });
  const queryClient = useQueryClient();
  const toast = useToast();
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
    onSuccess: () => {
      toast('المحل اتضاف. اعمل له حساب من تاب الموظفين');
      void queryClient.invalidateQueries({ queryKey: ['admin-stores'] });
      onClose();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }
  return (
    <Modal open={open} onClose={onClose} title="محل جديد" icon={Store} size="lg">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Input
          label="اسم المحل"
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
          <option value="">اختار المنطقة</option>
          {zones.data?.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </Select>
        <Input
          label="تليفون المحل"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          inputMode="tel"
          dir="ltr"
          required
        />
        <Input
          label="العنوان"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          required
        />
        <Input
          label="العمولة"
          suffix="٪"
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
        <Button type="submit" size="lg" loading={create.isPending} className="sm:col-span-2">
          إضافة المحل
        </Button>
      </form>
    </Modal>
  );
}

// ———— الموظفين ————
const ROLE_TONE: Record<Role, 'brand' | 'info' | 'success' | 'violet' | 'neutral'> = {
  admin: 'violet',
  ops: 'info',
  store: 'brand',
  driver: 'success',
  customer: 'neutral',
};

function UsersTab() {
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => get<AdminUser[]>('/admin/users'),
  });
  const saver = useSaver('admin-users');
  const dialog = useDialog();
  const [adding, setAdding] = useState(false);
  const update = useMutation({
    mutationFn: (v: { id: string; body: { isActive?: boolean; password?: string } }) =>
      patch(`/admin/users/${v.id}`, v.body),
    ...saver,
  });

  async function resetPassword(u: AdminUser) {
    const password = await dialog.prompt({
      title: `كلمة سر جديدة لـ ${u.name}`,
      description: 'هيخرج من كل أجهزته، وابعتله كلمة السر الجديدة بنفسك',
      label: 'كلمة السر الجديدة',
      type: 'password',
      minLength: 10,
      icon: KeyRound,
    });
    if (password) update.mutate({ id: u.id, body: { password } });
  }

  if (users.isPending) return <SkeletonList count={5} className="h-16" />;
  if (users.error) return <ErrorBox error={users.error} />;
  return (
    <>
      <TableCard
        title={`الموظفين (${num(users.data.length)})`}
        icon={Users}
        action={
          <Button size="sm" icon={UserPlus} onClick={() => setAdding(true)}>
            حساب جديد
          </Button>
        }
      >
        {users.data.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
            <Avatar name={u.name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className={cx('font-medium', !u.isActive && 'text-ink-400 line-through')}>
                {u.name}
              </div>
              <div className="text-xs text-ink-500">
                <span dir="ltr">{u.phone}</span>
              </div>
            </div>
            <Badge tone={ROLE_TONE[u.role]}>{ROLE_LABELS[u.role]}</Badge>
            <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => void resetPassword(u)}>
              كلمة سر
            </Button>
            <Switch
              checked={u.isActive}
              onChange={(v) => update.mutate({ id: u.id, body: { isActive: v } })}
              label={`${u.name} شغال`}
            />
          </div>
        ))}
      </TableCard>
      <NewUserModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function NewUserModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const stores = useQuery({
    queryKey: ['admin-stores'],
    queryFn: () => get<AdminStore[]>('/admin/stores'),
    enabled: open,
  });
  const queryClient = useQueryClient();
  const toast = useToast();
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
    onSuccess: () => {
      toast('الحساب اتعمل');
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setForm({ ...form, name: '', phone: '', password: '' });
      onClose();
    },
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }
  return (
    <Modal open={open} onClose={onClose} title="حساب موظف جديد" icon={UserPlus} size="lg">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
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
        {form.role === 'store' ? (
          <Select
            label="المحل"
            value={form.storeId}
            onChange={(e) => setForm({ ...form, storeId: e.target.value })}
            required
          >
            <option value="">اختار المحل</option>
            {stores.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        ) : (
          <div className="hidden sm:block" />
        )}
        <div className="sm:col-span-2">
          <Input
            label="كلمة السر"
            hint="١٠ حروف على الأقل. الموظف يقدر يغيّرها بعد أول دخول."
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            minLength={10}
            required
            dir="ltr"
          />
        </div>
        {create.error && (
          <div className="sm:col-span-2">
            <ErrorBox error={create.error} />
          </div>
        )}
        <Button type="submit" size="lg" loading={create.isPending} className="sm:col-span-2">
          إنشاء الحساب
        </Button>
      </form>
    </Modal>
  );
}

// ———— سجل العمليات ————
const ACTION_LABELS: Record<string, string> = {
  'auth.login': 'دخول',
  'auth.login_failed': 'محاولة دخول فاشلة',
  'auth.account_locked': 'قفل حساب بسبب محاولات غلط',
  'auth.login_blocked_locked': 'محاولة دخول لحساب مقفول',
  'auth.refresh_reuse_detected': 'محاولة استخدام جلسة مسروقة',
  'auth.login_otp': 'دخول بالكود',
  'auth.register': 'تسجيل عميل جديد',
  'auth.password_changed': 'تغيير كلمة السر',
  'auth.password_change_failed': 'محاولة فاشلة لتغيير كلمة السر',
  'order.placed': 'طلب جديد',
  'order.accepted': 'قبول طلب',
  'order.rejected': 'رفض طلب',
  'order.ready': 'طلب جاهز',
  'order.assigned': 'إسناد لطيار',
  'order.picked_up': 'استلام الطيار',
  'order.delivered': 'تسليم وتحصيل',
  'order.cancelled': 'إلغاء طلب',
  'finance.driver_settled': 'تسوية عهدة طيار',
  'finance.store_payout': 'تحويل لمحل',
  'finance.cash_diff_write_off': 'شطب فرق تحصيل',
  'finance.cash_diff_charge_driver': 'تحميل فرق على طيار',
  'product.updated': 'تعديل منتج',
  'product.created': 'منتج جديد',
  'store.opened': 'فتح المحل',
  'store.closed': 'قفل المحل',
  'zone.created': 'منطقة جديدة',
  'zone.updated': 'تعديل منطقة',
  'store.created': 'محل جديد',
  'store.updated': 'تعديل محل',
  'user.created': 'حساب جديد',
  'user.updated': 'تعديل حساب',
  'user.password_reset': 'كلمة سر جديدة لموظف',
};

function actionTone(action: string): 'danger' | 'success' | 'warning' | 'info' | 'neutral' {
  if (/failed|locked|reuse|rejected|cancelled|write_off/.test(action)) return 'danger';
  if (action.startsWith('finance.')) return 'warning';
  if (action.startsWith('order.')) return 'info';
  if (/created|register/.test(action)) return 'success';
  return 'neutral';
}

function Audit() {
  const logs = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => get<AuditRow[]>('/admin/audit-logs?limit=200'),
  });
  if (logs.isPending) return <SkeletonList count={6} className="h-12" />;
  if (logs.error) return <ErrorBox error={logs.error} />;
  return (
    <TableCard title="سجل العمليات الحساسة" icon={ScrollText}>
      <p className="bg-ink-50 px-5 py-3 text-sm text-ink-600">
        كل عملية مهمة متسجلة هنا. محدش يقدر يعدّل أو يمسح منها حاجة، ولا حتى مدير الشركة.
      </p>
      {logs.data.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
          <Activity className="size-4 text-ink-300" />
          <Badge tone={actionTone(l.action)}>{ACTION_LABELS[l.action] ?? l.action}</Badge>
          <span className="flex-1 text-ink-700">
            {l.actorName ?? 'غير معروف'}
            {l.actorRole && (
              <span className="text-ink-400">
                {' '}
                · {ROLE_LABELS[l.actorRole as Role] ?? l.actorRole}
              </span>
            )}
          </span>
          <span className="tabular text-xs text-ink-400">{dateTime(l.createdAt)}</span>
          <span className="text-xs text-ink-300" dir="ltr">
            {l.ip}
          </span>
        </div>
      ))}
    </TableCard>
  );
}

// ———— طلبات الانضمام ————
interface Lead {
  id: string;
  type: 'store' | 'driver';
  name: string;
  phone: string;
  details: string | null;
  handled: boolean;
  createdAt: string;
}

function Leads() {
  const leads = useQuery({ queryKey: ['admin-leads'], queryFn: () => get<Lead[]>('/admin/leads') });
  const saver = useSaver('admin-leads');
  const done = useMutation({
    mutationFn: (id: string) => patch(`/admin/leads/${id}/handled`),
    ...saver,
  });
  if (leads.isPending) return <SkeletonList count={3} className="h-16" />;
  if (leads.error) return <ErrorBox error={leads.error} />;
  return (
    <TableCard title="محلات وطيارين عايزين يشتغلوا معاك" icon={UserPlus}>
      {leads.data.length === 0 && (
        <p className="px-5 py-8 text-center text-sm text-ink-500">لسه مفيش طلبات</p>
      )}
      {leads.data.map((l) => (
        <div
          key={l.id}
          className={cx('flex flex-wrap items-center gap-3 px-5 py-3.5', l.handled && 'opacity-50')}
        >
          <Badge tone={l.type === 'store' ? 'brand' : 'success'}>
            {l.type === 'store' ? 'محل' : 'طيار'}
          </Badge>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{l.name}</div>
            {l.details && <div className="text-sm text-ink-500">{l.details}</div>}
            <div className="text-xs text-ink-400">{dateTime(l.createdAt)}</div>
          </div>
          <a href={`tel:${l.phone}`} className="text-sm font-semibold text-brand-700" dir="ltr">
            {l.phone}
          </a>
          {!l.handled && (
            <Button size="sm" variant="secondary" onClick={() => done.mutate(l.id)}>
              اتواصلت معاه
            </Button>
          )}
        </div>
      ))}
    </TableCard>
  );
}
