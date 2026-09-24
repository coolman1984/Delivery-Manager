import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button, Card, ErrorBox, Input } from '../components/ui';
import { ApiError, get, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { canSwitchTenant, getTenantSlug, setTenantSlug } from '../lib/tenant';
import type { SessionUser } from '../lib/types';

type Session = { accessToken: string; user: SessionUser };

const DEMO_TENANTS = [
  { slug: 'beni-suef', name: 'بني سويف' },
  { slug: 'fayoum', name: 'الفيوم' },
];

export default function Login() {
  const [mode, setMode] = useState<'customer' | 'staff'>('customer');
  const [tenant, setTenant] = useState(getTenantSlug());
  const tenantInfo = useQuery({
    queryKey: ['tenant', tenant],
    queryFn: () => get<{ name: string; governorate: string }>('/auth/tenant'),
  });

  function switchTenant(slug: string) {
    setTenantSlug(slug);
    setTenant(slug);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-4">
      <div className="text-center">
        <div className="text-5xl">🛵</div>
        <h1 className="mt-2 text-2xl font-bold text-brand-700">
          {tenantInfo.data?.name ?? 'توصيل'}
        </h1>
        <p className="text-sm text-slate-500">كل اللي محتاجه يوصلك لحد البيت</p>
      </div>

      {canSwitchTenant && import.meta.env.DEV && (
        <div className="flex justify-center gap-2 text-xs">
          <span className="self-center text-slate-500">شركة تجريبية:</span>
          {DEMO_TENANTS.map((t) => (
            <button
              key={t.slug}
              onClick={() => switchTenant(t.slug)}
              className={`rounded-full px-3 py-1 ${tenant === t.slug ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-slate-300'}`}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 rounded-xl bg-slate-200 p-1 text-sm">
        {(['customer', 'staff'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-lg py-2 font-semibold ${mode === m ? 'bg-white shadow-sm' : 'text-slate-600'}`}
          >
            {m === 'customer' ? 'عميل' : 'موظف (محل / طيار / إدارة)'}
          </button>
        ))}
      </div>

      <Card>
        {mode === 'customer' ? <CustomerLogin key={tenant} /> : <StaffLogin key={tenant} />}
      </Card>
    </div>
  );
}

/** بعد الدخول، App.tsx بيودّي كل واحد لصفحته */
function useFinish() {
  const { signIn } = useAuth();
  return (session: Session) => signIn(session);
}

function CustomerLogin() {
  const finish = useFinish();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [needName, setNeedName] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (step === 'phone') {
        const res = await post<{ devCode?: string }>('/auth/otp/request', { phone });
        setDevCode(res.devCode ?? null);
        setStep('code');
      } else {
        finish(
          await post<Session>('/auth/otp/verify', { phone, code, ...(needName ? { name } : {}) }),
        );
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NAME_REQUIRED') setNeedName(true);
      else setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {step === 'phone' ? (
        <Input
          label="رقم الموبايل"
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="01xxxxxxxxx"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
      ) : (
        <>
          <p className="text-sm text-slate-600">بعتنا كود من ٦ أرقام على {phone}</p>
          {devCode && (
            <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
              🧪 وضع التجربة — الكود: <b dir="ltr">{devCode}</b>
            </p>
          )}
          <Input
            label="الكود"
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
          {needName && (
            <Input
              label="اسمك (أول مرة بس)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          )}
        </>
      )}
      {error !== null && <ErrorBox error={error} />}
      <Button type="submit" loading={busy} className="w-full">
        {step === 'phone' ? 'ابعت الكود' : 'دخول'}
      </Button>
      {step === 'code' && (
        <button
          type="button"
          onClick={() => setStep('phone')}
          className="w-full text-sm text-slate-500"
        >
          تغيير الرقم
        </button>
      )}
    </form>
  );
}

function StaffLogin() {
  const finish = useFinish();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      finish(await post<Session>('/auth/login', { phone, password }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input
        label="رقم الموبايل"
        inputMode="tel"
        autoComplete="username"
        dir="ltr"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
      />
      <Input
        label="كلمة السر"
        type="password"
        autoComplete="current-password"
        dir="ltr"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error !== null && <ErrorBox error={error} />}
      <Button type="submit" loading={busy} className="w-full">
        دخول
      </Button>
    </form>
  );
}
