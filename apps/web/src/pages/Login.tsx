import { useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Pill,
  ShoppingBasket,
  Smartphone,
  User,
  Utensils,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { BrandMark, useTenant } from '../components/Shell';
import { Button, cx, ErrorBox, Input, Segmented } from '../components/ui';
import { ApiError, post } from '../lib/api';
import { useAuth } from '../lib/auth';
import { canSwitchTenant, getTenantSlug, setTenantSlug } from '../lib/tenant';
import type { SessionUser } from '../lib/types';

type Session = { accessToken: string; user: SessionUser };
type Mode = 'login' | 'register' | 'otp';

const DEMO_TENANTS = [
  { value: 'beni-suef', label: 'بني سويف' },
  { value: 'fayoum', label: 'الفيوم' },
];

export default function Login() {
  const tenant = useTenant();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('login');
  const [slug, setSlug] = useState(getTenantSlug());

  function switchTenant(next: string) {
    setTenantSlug(next);
    setSlug(next);
    void queryClient.invalidateQueries({ queryKey: ['tenant'] });
  }

  const modes: Array<{ value: Mode; label: string }> = [
    { value: 'login', label: 'دخول' },
    { value: 'register', label: 'حساب جديد' },
    ...(tenant.data?.otpEnabled ? [{ value: 'otp' as const, label: 'دخول بكود' }] : []),
  ];

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-2">
      {/* الجزء التعريفي */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-amber-400 px-6 pt-10 pb-20 text-white lg:flex lg:flex-col lg:justify-center lg:px-16 lg:pb-10">
        <div className="absolute -top-24 -left-24 size-72 rounded-full bg-white/10" />
        <div className="absolute -right-16 -bottom-28 size-80 rounded-full bg-white/10" />
        <div className="relative mx-auto max-w-md lg:mx-0">
          <BrandMark glass className="size-14" />
          <h1 className="mt-6 text-3xl leading-snug font-bold lg:text-4xl">
            {tenant.data?.name ?? 'توصيل'}
          </h1>
          <p className="mt-2 text-base text-white/85 lg:text-lg">
            كل اللي محتاجه من مطاعم وصيدليات وسوبر ماركت، يوصلك لحد باب البيت.
          </p>
          <div className="mt-8 hidden gap-3 lg:flex">
            {[
              { icon: Utensils, label: 'مطاعم' },
              { icon: Pill, label: 'صيدليات' },
              { icon: ShoppingBasket, label: 'سوبر ماركت' },
            ].map((c) => (
              <div
                key={c.label}
                className="flex items-center gap-2 rounded-2xl bg-white/15 px-4 py-3 text-sm font-medium ring-1 ring-white/25 backdrop-blur"
              >
                <c.icon className="size-5" /> {c.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* الفورم */}
      <section className="relative -mt-10 rounded-t-[32px] bg-canvas px-5 pt-8 pb-10 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:rounded-none">
        <div className="mx-auto w-full max-w-sm">
          {canSwitchTenant && import.meta.env.DEV && (
            <div className="mb-6 flex items-center justify-between gap-2 rounded-2xl bg-amber-50 p-2 ps-3 ring-1 ring-amber-200/70">
              <span className="text-xs font-medium text-amber-800">نسخة تجريبية</span>
              <Segmented value={slug} onChange={switchTenant} options={DEMO_TENANTS} />
            </div>
          )}
          <Segmented
            value={mode}
            onChange={setMode}
            options={modes}
            className="mb-6 w-full [&>button]:flex-1 [&>button]:justify-center"
          />
          {mode === 'login' && <PasswordLogin key={slug} />}
          {mode === 'register' && <Register key={slug} />}
          {mode === 'otp' && <OtpLogin key={slug} />}
        </div>
      </section>
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  autoComplete,
  label = 'كلمة السر',
  hint,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  label?: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        label={label}
        hint={hint}
        icon={Lock}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        dir="ltr"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="pe-12"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute end-2 top-[34px] cursor-pointer rounded-xl p-2 text-ink-400 hover:text-ink-700"
        aria-label={show ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}

function useSubmit<T>(action: () => Promise<T>, onDone: (r: T) => void) {
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      onDone(await action());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return { submit, error, busy, setError };
}

function PasswordLogin() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const { submit, error, busy } = useSubmit(
    () => post<Session>('/auth/login', { phone, password }),
    signIn,
  );
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">أهلاً بيك تاني</h2>
        <p className="mt-1 text-sm text-ink-500">للعملاء والمحلات والطيارين والإدارة</p>
      </div>
      <Input
        label="رقم الموبايل"
        icon={Smartphone}
        inputMode="tel"
        autoComplete="username"
        dir="ltr"
        placeholder="01xxxxxxxxx"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
      />
      <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
      {error !== null && <ErrorBox error={error} />}
      <Button type="submit" size="lg" loading={busy} block>
        دخول
      </Button>
    </form>
  );
}

function Register() {
  const { signIn } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const { submit, error, busy } = useSubmit(
    () => post<Session>('/auth/register', { name, phone, password }),
    signIn,
  );
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">اعمل حسابك في دقيقة</h2>
        <p className="mt-1 text-sm text-ink-500">عشان تطلب وتتابع طلباتك</p>
      </div>
      <Input
        label="اسمك"
        icon={User}
        autoComplete="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        minLength={2}
      />
      <Input
        label="رقم الموبايل"
        icon={Smartphone}
        inputMode="tel"
        autoComplete="tel"
        dir="ltr"
        placeholder="01xxxxxxxxx"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
      />
      <PasswordField
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint="١٠ حروف على الأقل"
      />
      {error !== null && <ErrorBox error={error} />}
      <Button type="submit" size="lg" loading={busy} block>
        إنشاء الحساب
      </Button>
    </form>
  );
}

function OtpLogin() {
  const { signIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [needName, setNeedName] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);
  const { submit, error, busy, setError } = useSubmit(
    async () => {
      if (step === 'phone') {
        const res = await post<{ devCode?: string }>('/auth/otp/request', { phone });
        setDevCode(res.devCode ?? null);
        setStep('code');
        return null;
      }
      try {
        return await post<Session>('/auth/otp/verify', {
          phone,
          code,
          ...(needName ? { name } : {}),
        });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NAME_REQUIRED') {
          setNeedName(true);
          return null;
        }
        throw err;
      }
    },
    (s) => s && signIn(s),
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      {step === 'phone' ? (
        <Input
          label="رقم الموبايل"
          icon={Smartphone}
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
          <p className="text-sm text-ink-600">
            بعتنا كود من ٦ أرقام على <b dir="ltr">{phone}</b>
          </p>
          {devCode && (
            <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
              وضع التجربة — الكود:{' '}
              <b dir="ltr" className="tabular tracking-widest">
                {devCode}
              </b>
            </p>
          )}
          <Input
            label="الكود"
            icon={KeyRound}
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            className="tabular tracking-[0.5em]"
          />
          {needName && (
            <Input
              label="اسمك (أول مرة بس)"
              icon={User}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          )}
        </>
      )}
      {error !== null && <ErrorBox error={error} />}
      <Button type="submit" size="lg" loading={busy} block>
        {step === 'phone' ? 'ابعت الكود' : 'دخول'}
      </Button>
      {step === 'code' && (
        <button
          type="button"
          onClick={() => {
            setStep('phone');
            setError(null);
          }}
          className={cx('w-full cursor-pointer text-sm text-ink-500 hover:text-ink-800')}
        >
          تغيير الرقم
        </button>
      )}
    </form>
  );
}
