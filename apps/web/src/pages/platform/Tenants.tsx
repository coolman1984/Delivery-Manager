import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Building2,
  Copy,
  ExternalLink,
  KeyRound,
  Pause,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Modal, useDialog } from '../../components/dialog';
import { useToast } from '../../components/toast';
import {
  Badge,
  Button,
  Card,
  ErrorBox,
  Input,
  Money,
  PageHeader,
  SectionTitle,
  Select,
  SkeletonList,
  Textarea,
} from '../../components/ui';
import { money, num, toPiasters } from '../../lib/format';
import {
  pget,
  ppatch,
  ppost,
  tenantUrl,
  type Plan,
  type PlatformTenant,
  type TenantDetail,
} from './api';
import { dateOnly, SubscriptionBadge } from './bits';

export default function Tenants() {
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const list = useQuery({
    queryKey: ['platform', 'tenants'],
    queryFn: () => pget<PlatformTenant[]>('/tenants'),
  });
  const openId = params.get('open');
  const rows = useMemo(
    () =>
      (list.data ?? []).filter(
        (t) => !search || t.name.includes(search.trim()) || t.slug.includes(search.trim()),
      ),
    [list.data, search],
  );

  return (
    <div>
      <PageHeader
        title="الشركات"
        subtitle="كل شركة مشتركة في المنصة، باقتها، واشتراكها لحد إمتى"
        actions={
          <Button icon={Plus} variant="dark" onClick={() => setCreating(true)}>
            شركة جديدة
          </Button>
        }
      />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-ink-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="دوّر باسم الشركة"
          aria-label="بحث في الشركات"
          className="h-11 w-full rounded-2xl border-0 bg-white ps-10 pe-4 text-sm ring-1 ring-ink-200 focus:ring-2 focus:ring-ink-900 focus:outline-none"
        />
      </div>
      {list.isPending && <SkeletonList count={3} />}
      {list.error && <ErrorBox error={list.error} />}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams({ open: t.id })}
            className="cursor-pointer rounded-3xl bg-white p-5 text-start shadow-card ring-1 ring-ink-200/60 transition hover:ring-ink-300"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#0f1020] text-amber-300">
                <Building2 className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-ink-900">{t.name}</div>
                <div className="text-xs text-ink-500" dir="ltr">
                  {t.slug}
                </div>
              </div>
              <SubscriptionBadge tenant={t} />
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 rounded-2xl bg-ink-50 p-3 text-center text-xs">
              <Stat label="الباقة" value={t.plan?.name ?? '—'} />
              <Stat label="طلبات الشهر" value={num(t.stats.orders30d)} />
              <Stat label="محلات" value={num(t.stats.stores)} />
              <Stat label="طيارين" value={num(t.stats.drivers)} />
            </div>
          </button>
        ))}
      </div>
      {list.data && rows.length === 0 && (
        <p className="py-10 text-center text-ink-500">مفيش شركات بالاسم ده</p>
      )}
      <CreateTenantModal open={creating} onClose={() => setCreating(false)} />
      {openId && <TenantModal id={openId} onClose={() => setParams({})} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-bold text-ink-900">{value}</div>
      <div className="text-ink-500">{label}</div>
    </div>
  );
}

function usePlans() {
  return useQuery({ queryKey: ['platform', 'plans'], queryFn: () => pget<Plan[]>('/plans') });
}

/** بيانات الدخول بتظهر مرة واحدة بس: لازم تتنسخ وتتبعت لصاحبها */
function Credentials({
  phone,
  password,
  url,
}: {
  phone: string;
  password: string;
  url?: string | null;
}) {
  const toast = useToast();
  const text = [url && `العنوان: ${url}`, `رقم الموبايل: ${phone}`, `كلمة السر: ${password}`]
    .filter(Boolean)
    .join('\n');
  return (
    <div className="space-y-3 rounded-3xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
      <div className="flex items-center gap-2 font-semibold text-emerald-900">
        <ShieldCheck className="size-5" /> بيانات دخول المدير (هتظهر المرة دي بس)
      </div>
      <dl className="divide-y divide-ink-100 rounded-2xl bg-white text-sm">
        {[...(url ? [['العنوان', url]] : []), ['رقم الموبايل', phone], ['كلمة السر', password]].map(
          ([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <dt className="text-ink-500">{k}</dt>
              <dd dir="ltr" className="font-mono font-semibold text-ink-900 select-all">
                {v}
              </dd>
            </div>
          ),
        )}
      </dl>
      <Button
        variant="secondary"
        size="sm"
        icon={Copy}
        onClick={() =>
          void navigator.clipboard
            ?.writeText(text)
            .then(() => toast('اتنسخت ✔️'))
            .catch(() => undefined)
        }
      >
        نسخ
      </Button>
      <p className="text-xs text-emerald-800">ابعتها للمدير، وقوله يغيّر كلمة السر أول ما يدخل.</p>
    </div>
  );
}

function CreateTenantModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const plans = usePlans();
  const [form, setForm] = useState({
    name: '',
    slug: '',
    governorate: '',
    planId: '',
    trialDays: '14',
    adminName: '',
    adminPhone: '',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const create = useMutation({
    mutationFn: () =>
      ppost<{ tenant: PlatformTenant; admin: { phone: string; password: string } }>('/tenants', {
        ...form,
        slug: form.slug.trim().toLowerCase(),
        planId: form.planId || plans.data?.find((p) => p.isActive)?.id,
        trialDays: Number(form.trialDays),
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['platform'] }),
  });
  function close() {
    create.reset();
    setForm({
      name: '',
      slug: '',
      governorate: '',
      planId: '',
      trialDays: '14',
      adminName: '',
      adminPhone: '',
    });
    onClose();
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    create.mutate();
  }

  return (
    <Modal open={open} onClose={close} title="شركة جديدة" icon={Building2} size="lg">
      {create.data ? (
        <div className="space-y-4">
          <p className="text-ink-700">
            ✅ شركة <b>{create.data.tenant.name}</b> جاهزة، واشتراكها التجريبي لحد{' '}
            {dateOnly(create.data.tenant.paidUntil)}.
          </p>
          <Credentials {...create.data.admin} url={tenantUrl(create.data.tenant.slug)} />
          <Button block variant="dark" onClick={close}>
            تمام
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Input
            label="اسم الشركة"
            placeholder="توصيل المنيا"
            value={form.name}
            onChange={set('name')}
            required
            minLength={2}
          />
          <Input
            label="الاسم المختصر (بالإنجليزي)"
            hint="بيبقى عنوانها: الاسم.الموقع"
            placeholder="minya"
            dir="ltr"
            value={form.slug}
            onChange={set('slug')}
            pattern="[a-z0-9\-]{2,40}"
            required
          />
          <Input
            label="المحافظة"
            value={form.governorate}
            onChange={set('governorate')}
            required
            minLength={2}
          />
          <Select label="الباقة" value={form.planId} onChange={set('planId')}>
            {plans.data
              ?.filter((p) => p.isActive)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {money(p.monthlyPrice)} شهرياً
                </option>
              ))}
          </Select>
          <Input
            label="مدير الشركة"
            value={form.adminName}
            onChange={set('adminName')}
            required
            minLength={2}
          />
          <Input
            label="موبايل المدير"
            inputMode="tel"
            dir="ltr"
            value={form.adminPhone}
            onChange={set('adminPhone')}
            required
          />
          <Input
            label="أيام التجربة المجانية"
            inputMode="numeric"
            value={form.trialDays}
            onChange={set('trialDays')}
            required
          />
          <div className="sm:col-span-2">
            {create.error && <ErrorBox error={create.error} />}
            <Button
              type="submit"
              block
              variant="dark"
              size="lg"
              className="mt-2"
              loading={create.isPending}
            >
              إنشاء الشركة
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function TenantModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const dialog = useDialog();
  const toast = useToast();
  const plans = usePlans();
  const [creds, setCreds] = useState<{ phone: string; password: string } | null>(null);
  const q = useQuery({
    queryKey: ['platform', 'tenant', id],
    queryFn: () => pget<TenantDetail>(`/tenants/${id}`),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['platform'] });
  const onError = (e: Error) => toast(e.message, 'error');

  const status = useMutation({
    mutationFn: (v: { active: boolean; reason?: string }) =>
      v.active
        ? ppost(`/tenants/${id}/activate`)
        : ppost(`/tenants/${id}/suspend`, { reason: v.reason }),
    onSuccess: (_, v) => {
      toast(v.active ? 'الشركة رجعت تشتغل' : 'الشركة اتوقفت');
      refresh();
    },
    onError,
  });
  const update = useMutation({
    mutationFn: (body: object) => ppatch(`/tenants/${id}`, body),
    onSuccess: () => {
      toast('اتحفظ');
      refresh();
    },
    onError,
  });
  const reset = useMutation({
    mutationFn: (userId: string) =>
      ppost<{ phone: string; password: string }>(`/tenants/${id}/admins/${userId}/reset-password`),
    onSuccess: (r) => setCreds(r),
    onError,
  });

  const t = q.data;
  async function suspend() {
    const reason = await dialog.prompt({
      title: `إيقاف ${t!.name}؟`,
      description: 'كل عملاء وموظفين الشركة هيتقفل عليهم فوراً لحد ما ترجّعها.',
      label: 'السبب',
      danger: true,
      confirmLabel: 'إيقاف',
      minLength: 3,
      suggestions: ['متأخرين في الدفع', 'طلب الشركة', 'مخالفة الشروط'],
    });
    if (reason) status.mutate({ active: false, reason });
  }
  async function resetPassword(userId: string, name: string) {
    const ok = await dialog.confirm({
      title: `كلمة سر جديدة لـ${name}؟`,
      description: 'القديمة هتبطل، وهيخرج من كل الأجهزة.',
      confirmLabel: 'أيوه',
      icon: KeyRound,
    });
    if (ok) reset.mutate(userId);
  }

  return (
    <Modal open onClose={onClose} title={t?.name ?? 'الشركة'} icon={Building2} size="lg">
      {q.isPending && <SkeletonList count={3} />}
      {q.error && <ErrorBox error={q.error} />}
      {t && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <SubscriptionBadge tenant={t} />
            <Badge>{t.governorate}</Badge>
            {tenantUrl(t.slug) && (
              <a
                href={tenantUrl(t.slug)!}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-sky-700"
              >
                <ExternalLink className="size-4" /> فتح موقعها
              </a>
            )}
          </div>
          {t.status === 'suspended' && t.suspendedReason && (
            <p className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-800">
              سبب الإيقاف: {t.suspendedReason}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat icon={Banknote} label="مبيعات ٣٠ يوم" value={money(t.stats.gmv30d)} />
            <MiniStat
              icon={Store}
              label="محلات"
              value={`${num(t.stats.stores)}${t.plan?.maxStores ? ` / ${num(t.plan.maxStores)}` : ''}`}
            />
            <MiniStat
              icon={Users}
              label="طيارين"
              value={`${num(t.stats.drivers)}${t.plan?.maxDrivers ? ` / ${num(t.plan.maxDrivers)}` : ''}`}
            />
            <MiniStat icon={Users} label="عملاء" value={num(t.stats.customers)} />
          </div>

          <PaymentForm tenant={t} onDone={refresh} />

          <section className="space-y-3">
            <SectionTitle icon={Banknote}>المدفوعات</SectionTitle>
            {t.payments.length === 0 ? (
              <p className="text-sm text-ink-500">لسه مفيش مدفوعات</p>
            ) : (
              <ul className="divide-y divide-ink-100 rounded-2xl ring-1 ring-ink-200">
                {t.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <Money value={p.amount} className="font-bold" />
                    <span className="flex-1 text-ink-500">
                      {num(p.months)} شهر · من {dateOnly(p.periodFrom)} لـ {dateOnly(p.periodTo)}
                      {p.note ? ` · ${p.note}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <SectionTitle icon={Building2}>بيانات الشركة</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                label="الباقة"
                value={t.plan?.id ?? ''}
                onChange={(e) => update.mutate({ planId: e.target.value })}
              >
                {plans.data?.map((p) => (
                  <option key={p.id} value={p.id} disabled={!p.isActive}>
                    {p.name} — {money(p.monthlyPrice)}
                  </option>
                ))}
              </Select>
              <Input
                label="موبايل التواصل"
                dir="ltr"
                defaultValue={t.contactPhone ?? ''}
                onBlur={(e) =>
                  e.target.value !== (t.contactPhone ?? '') &&
                  update.mutate({ contactPhone: e.target.value || null })
                }
              />
            </div>
            <Textarea
              label="ملاحظات (بتظهر ليك بس)"
              defaultValue={t.notes ?? ''}
              onBlur={(e) =>
                e.target.value !== (t.notes ?? '') &&
                update.mutate({ notes: e.target.value || null })
              }
            />
          </section>

          <section className="space-y-3">
            <SectionTitle icon={KeyRound}>مديرين الشركة</SectionTitle>
            {t.admins.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-2xl p-3 ring-1 ring-ink-200"
              >
                <div className="flex-1">
                  <div className="font-semibold">{a.name}</div>
                  <div className="text-xs text-ink-500" dir="ltr">
                    {a.phone}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={KeyRound}
                  onClick={() => void resetPassword(a.id, a.name)}
                  loading={reset.isPending}
                >
                  كلمة سر جديدة
                </Button>
              </div>
            ))}
            {creds && <Credentials {...creds} url={tenantUrl(t.slug)} />}
          </section>

          <div className="border-t border-ink-100 pt-4">
            {t.status === 'active' ? (
              <Button
                variant="danger"
                icon={Pause}
                onClick={() => void suspend()}
                loading={status.isPending}
              >
                إيقاف الشركة
              </Button>
            ) : (
              <Button
                icon={Play}
                onClick={() => status.mutate({ active: true })}
                loading={status.isPending}
              >
                تشغيل الشركة
              </Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Store;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-3">
      <Icon className="mb-1 size-4 text-ink-400" />
      <div className="tabular font-bold text-ink-900">{value}</div>
      <div className="text-xs text-ink-500">{label}</div>
    </Card>
  );
}

function PaymentForm({ tenant, onDone }: { tenant: TenantDetail; onDone: () => void }) {
  const toast = useToast();
  const [months, setMonths] = useState('1');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const suggested = (tenant.plan?.monthlyPrice ?? 0) * Number(months);
  const pay = useMutation({
    mutationFn: () =>
      ppost<{ paidUntil: string; reactivated: boolean }>(`/tenants/${tenant.id}/payments`, {
        months: Number(months),
        ...(amount ? { amount: toPiasters(amount) } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: (r) => {
      toast(
        `اتسجلت ✔️ الاشتراك بقى لحد ${dateOnly(r.paidUntil)}${r.reactivated ? ' والشركة رجعت تشتغل' : ''}`,
      );
      setAmount('');
      setNote('');
      onDone();
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        pay.mutate();
      }}
      className="space-y-3 rounded-3xl bg-amber-50/70 p-4 ring-1 ring-amber-200"
    >
      <div className="font-semibold text-amber-900">
        تسجيل دفعة اشتراك · مدفوع لحد {dateOnly(tenant.paidUntil)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="المدة" value={months} onChange={(e) => setMonths(e.target.value)}>
          {[1, 3, 6, 12].map((m) => (
            <option key={m} value={m}>
              {num(m)} شهر
            </option>
          ))}
        </Select>
        <Input
          label="المبلغ بالجنيه"
          inputMode="decimal"
          placeholder={String(suggested / 100)}
          hint={`سعر الباقة: ${money(suggested)}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Input
          label="ملاحظة"
          placeholder="كاش / تحويل"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
        />
      </div>
      <Button type="submit" variant="dark" icon={Banknote} loading={pay.isPending}>
        تسجيل الدفعة
      </Button>
    </form>
  );
}
