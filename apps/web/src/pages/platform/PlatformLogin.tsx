import { useMutation } from '@tanstack/react-query';
import { Crown, KeyRound, Mail, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, ErrorBox, Input } from '../../components/ui';
import { ppost, type PlatformMe } from './api';

type LoginResponse =
  | { status: 'ok'; admin: PlatformMe }
  | { status: 'code_required' }
  | { status: 'enroll'; enrollToken: string; secret: string; uri: string };

/**
 * دخول مالك المنصة على ٣ خطوات: الإيميل وكلمة السر، وبعدين كود من تطبيق على الموبايل.
 * أول مرة بس: بنعرض مربع (QR) يتصوّر من تطبيق زي Google Authenticator.
 */
export default function PlatformLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'password' | 'code' | 'enroll'>('password');
  const [enroll, setEnroll] = useState<{ token: string; secret: string; uri: string } | null>(null);

  const login = useMutation({
    mutationFn: () =>
      ppost<LoginResponse>('/auth/login', {
        email,
        password,
        ...(step === 'code' ? { code } : {}),
      }),
    onSuccess: (r) => {
      if (r.status === 'ok') return onDone();
      if (r.status === 'code_required') return setStep('code');
      setEnroll({ token: r.enrollToken, secret: r.secret, uri: r.uri });
      setStep('enroll');
    },
    onError: () => setCode(''),
  });
  const confirm = useMutation({
    mutationFn: () => ppost<LoginResponse>('/auth/enroll', { enrollToken: enroll!.token, code }),
    onSuccess: () => onDone(),
    onError: () => setCode(''),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (step === 'enroll') confirm.mutate();
    else login.mutate();
  }

  const error = login.error ?? confirm.error;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0f1020] p-4">
      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-40 -right-40 size-[28rem] rounded-full bg-amber-400/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 size-[28rem] rounded-full bg-indigo-500/15 blur-3xl" />
      </div>
      <form
        onSubmit={submit}
        className="relative w-full max-w-md space-y-5 rounded-[2rem] bg-white p-7 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-[#0f1020] text-amber-300">
            <Crown className="size-6" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-ink-900">لوحة مالك المنصة</h1>
            <p className="text-sm text-ink-500">الشركات والاشتراكات والباقات</p>
          </div>
        </div>

        {step === 'password' && (
          <>
            <Input
              label="الإيميل"
              icon={Mail}
              type="email"
              dir="ltr"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="كلمة السر"
              icon={KeyRound}
              type="password"
              dir="ltr"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </>
        )}

        {step === 'enroll' && enroll && <EnrollBox secret={enroll.secret} uri={enroll.uri} />}

        {(step === 'code' || step === 'enroll') && (
          <Input
            label={
              step === 'code' ? 'الكود اللي في تطبيق الموبايل' : 'اكتب الكود اللي ظهر في التطبيق'
            }
            icon={Smartphone}
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            maxLength={6}
            pattern="\d{6}"
            placeholder="123456"
            className="text-center text-2xl tracking-[0.5em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
            required
          />
        )}

        {error && <ErrorBox error={error} />}
        <Button
          type="submit"
          variant="dark"
          size="lg"
          block
          icon={ShieldCheck}
          loading={login.isPending || confirm.isPending}
        >
          {step === 'password' ? 'متابعة' : step === 'code' ? 'دخول' : 'تفعيل ودخول'}
        </Button>
        <p className="text-center text-xs text-ink-400">
          الدخول هنا محمي بكلمة سر وكود متغير كل ٣٠ ثانية. كل عملية بتتسجل.
        </p>
      </form>
    </div>
  );
}

function EnrollBox({ secret, uri }: { secret: string; uri: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    // المربع بيتعمل على جهازك، والسر مابيروحش لأي موقع تاني
    void import('qrcode').then((m) => m.toDataURL(uri, { margin: 1, width: 220 }).then(setQr));
  }, [uri]);
  return (
    <div className="space-y-3 rounded-3xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <p className="text-sm font-semibold text-amber-900">
        أول مرة: نزّل تطبيق Google Authenticator على موبايلك، واعمل مسح للمربع ده
      </p>
      <div className="flex justify-center">
        {qr ? (
          <img src={qr} alt="مربع تسجيل تطبيق الكود" className="size-52 rounded-2xl bg-white p-2" />
        ) : (
          <div className="size-52 animate-pulse rounded-2xl bg-white" />
        )}
      </div>
      <p className="text-xs text-amber-800">أو اكتب المفتاح ده في التطبيق بإيدك:</p>
      <code
        dir="ltr"
        className="block rounded-xl bg-white p-2 text-center font-mono text-sm tracking-wider break-all text-ink-800 select-all"
      >
        {secret.match(/.{1,4}/g)?.join(' ')}
      </code>
    </div>
  );
}
