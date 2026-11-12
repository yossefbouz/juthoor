'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Mail, ShieldCheck, ArrowLeft, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpCodeInput } from '@/components/Auth/OtpCodeInput';
import { useLocale } from '@/contexts/LocaleContext';
import { requestEmailOtpAction, verifyEmailOtpAction } from '@/data/auth/auth';
import { OTP_LENGTH, isValidOtp } from '@/lib/auth/otpConfig';

type Step = 'email' | 'code';

/**
 * Two-step OTP sign-up:
 *   1. Email + display name → server sends a 6-digit code via Supabase Auth.
 *   2. User types the code → verifyOtp → session cookie → router.push.
 */
export function SignUp({ next }: { next?: string }) {
  const { t, locale, dir } = useLocale();
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // T&C Art 2.2 / Privacy §11: must be 16+ and accept the Terms & Privacy Policy.
  const [agreed, setAgreed] = useState(false);

  // Render the form client-side only. Form-filler browser extensions
  // stamp attributes (fdprocessedid) onto SSR'd inputs before React
  // hydrates, which breaks hydration and cascades into insertBefore /
  // hooks-order crashes inside the animated form. With no SSR'd form
  // there is nothing to corrupt.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const result = await requestEmailOtpAction({
        email: email.trim(),
        mode: 'signup',
        displayName: displayName.trim() || undefined,
      });
      if (result?.serverError) throw new Error(result.serverError);
      setStep('code');
      setInfo(t(`فحَصْنا بريدك. أدخل الرمز المؤلَّف من ${OTP_LENGTH} أرقام.`, `Check your email for an ${OTP_LENGTH}-digit code.`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setBusy(false);
    }
  }

  async function verify(codeValue: string) {
    setError(null);
    setBusy(true);
    try {
      const result = await verifyEmailOtpAction({ email: email.trim(), token: codeValue });
      // next-safe-action returns { data, serverError, validationErrors }.
      // serverError is now the real Supabase message (handleServerError in safe-action.ts).
      // validationErrors is a Zod shape — flatten the first message for display.
      const validationMsg = result?.validationErrors
        ? Object.values(result.validationErrors)
            .flatMap((v: unknown) =>
              v && typeof v === 'object' && '_errors' in v && Array.isArray((v as { _errors: string[] })._errors)
                ? (v as { _errors: string[] })._errors
                : [],
            )
            .find(Boolean)
        : undefined;
      const rawMsg = result?.serverError ?? validationMsg;
      if (rawMsg) {
        const text = String(rawMsg);
        throw new Error(
          /Token has expired|invalid|otp/i.test(text)
            ? t('الرمز غير صحيح أو انتهت صلاحيته', 'Code is incorrect or expired. Try again or resend.')
            : text,
        );
      }
      // D11: registration continues through PFT match + optional verify.
      // /verify remains available for users who skip this step later.
      router.push(next ?? '/register/complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('الرمز غير صحيح', 'Invalid code'));
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) {
    return <div dir={dir} className="min-h-[420px] w-full max-w-md" aria-busy="true" />;
  }

  return (
    <div dir={dir} className="w-full max-w-md">
      <Card className="border-[var(--jt-olive-200)]/60 shadow-[var(--jt-shadow-md)]">
        <CardHeader className="text-center">
          <div className="mb-3 flex justify-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--jt-olive-700)] text-[var(--jt-stone-50)]">
              <Sparkles className="h-5 w-5" />
            </span>
          </div>
          <CardTitle
            className="text-3xl font-bold text-[var(--jt-olive-900)]"
            style={{ fontFamily: 'var(--jt-font-display)' }}
          >
            {step === 'email'
              ? t('أنشئ حسابك في جذور', 'Create your Juthoor account')
              : t('تحقّق من بريدك', 'Check your email')}
          </CardTitle>
          <CardDescription className="mt-2">
            {step === 'email'
              ? t(
                  `سنرسل لك رمزًا من ${OTP_LENGTH} أرقام بدلًا من كلمة سر.`,
                  `We'll email you an ${OTP_LENGTH}-digit code instead of a password.`,
                )
              : t(`أرسلنا الرمز إلى ${email}`, `Sent a code to ${email}`)}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <AnimatePresence mode="wait" initial={false}>
            {step === 'email' ? (
              <motion.form
                key="email"
                onSubmit={sendCode}
                initial={{ opacity: 0, x: dir === 'rtl' ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir === 'rtl' ? -20 : 20 }}
                transition={{ duration: 0.25 }}
                className="space-y-4"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="display-name">{t('اسم العرض', 'Display name')}</Label>
                  <Input
                    id="display-name"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t('يوسف العجرمي', 'Yousef Al-Ajrami')}
                    autoComplete="name"
                    required
                    style={{ fontFamily: locale === 'ar' ? 'var(--jt-font-arabic)' : 'var(--jt-font-latin)' }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">{t('البريد الإلكتروني', 'Email address')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <label className="flex items-start gap-2.5 rounded-xl border border-[var(--jt-stone-200)] bg-[var(--jt-stone-50)]/60 p-3">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 flex-none accent-[var(--jt-olive-700)]"
                  />
                  <span className="text-xs text-[var(--jt-stone-700)]" style={{ lineHeight: 1.6 }}>
                    {t('أؤكّد أنّ عمري 16 عامًا أو أكثر، وأوافق على ', 'I confirm I am 16 or older and agree to the ')}
                    <a href="/terms" target="_blank" className="font-semibold text-[var(--jt-olive-700)] underline underline-offset-2">
                      {t('الشروط', 'Terms')}
                    </a>
                    {t(' و', ' & ')}
                    <a href="/privacy" target="_blank" className="font-semibold text-[var(--jt-olive-700)] underline underline-offset-2">
                      {t('سياسة الخصوصية', 'Privacy Policy')}
                    </a>
                    {t('.', '.')}
                  </span>
                </label>

                {error && (
                  <div className="rounded-xl bg-[var(--jt-terra-50)] p-3 text-sm text-[var(--jt-terra-700)]">{error}</div>
                )}

                <Button
                  type="submit"
                  disabled={busy || !email.trim() || !displayName.trim() || !agreed}
                  className="w-full bg-[var(--jt-olive-700)] hover:bg-[var(--jt-olive-800)]"
                >
                  {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Mail className="me-2 h-4 w-4" />}
                  {t('أرسل الرمز', 'Send code')}
                </Button>

                <p className="text-center text-xs text-[var(--jt-stone-500)]">
                  {t('لديك حساب؟', 'Already have an account?')}{' '}
                  <a href="/login" className="font-semibold text-[var(--jt-olive-700)] underline underline-offset-4 hover:text-[var(--jt-olive-900)]">
                    {t('تسجيل الدخول', 'Sign in')}
                  </a>
                </p>
              </motion.form>
            ) : (
              <motion.div
                key="code"
                initial={{ opacity: 0, x: dir === 'rtl' ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: dir === 'rtl' ? -20 : 20 }}
                transition={{ duration: 0.25 }}
                className="space-y-5"
              >
                <OtpCodeInput
                  value={code}
                  onChange={setCode}
                  onComplete={verify}
                  length={OTP_LENGTH}
                  disabled={busy}
                />

                {info && !error && (
                  <p className="text-center text-xs text-[var(--jt-stone-500)]">{info}</p>
                )}
                {error && (
                  <div className="rounded-xl bg-[var(--jt-terra-50)] p-3 text-center text-sm text-[var(--jt-terra-700)]">{error}</div>
                )}

                <Button
                  type="button"
                  onClick={() => verify(code)}
                  disabled={busy || !isValidOtp(code)}
                  className="w-full bg-[var(--jt-olive-700)] hover:bg-[var(--jt-olive-800)]"
                >
                  {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="me-2 h-4 w-4" />}
                  {t('تحقّق وادخل', 'Verify & sign in')}
                </Button>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setCode('');
                      setError(null);
                    }}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--jt-stone-500)] hover:text-[var(--jt-olive-700)]"
                  >
                    <ArrowLeft className="h-3 w-3 rtl:rotate-180" />
                    {t('عدّل البريد', 'Change email')}
                  </button>
                  <button
                    type="button"
                    onClick={() => sendCode()}
                    disabled={busy}
                    className="font-semibold text-[var(--jt-olive-700)] hover:text-[var(--jt-olive-900)] disabled:opacity-50"
                  >
                    {t('أرسل رمزًا جديدًا', 'Resend code')}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </div>
  );
}
