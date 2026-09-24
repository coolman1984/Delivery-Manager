import { base32Decode, base32Encode, generateTotpSecret, totpAt, verifyTotp } from './totp';

describe('كود تطبيق الموبايل (TOTP)', () => {
  // أمثلة المعيار الرسمي RFC 6238 (السر "12345678901234567890")
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('بيطابق أمثلة المعيار الرسمي', () => {
    expect(totpAt(secret, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(totpAt(secret, Math.floor(2000000000 / 30), 8)).toBe('69279037');
  });

  it('بيقبل الكود الحالي وفرق ٣٠ ثانية بس', () => {
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpAt(secret, step), now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(step - 1);
    expect(verifyTotp(secret, totpAt(secret, step - 3), now)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('الترميز رايح جاي من غير ما يبوظ', () => {
    const s = generateTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
  });
});
