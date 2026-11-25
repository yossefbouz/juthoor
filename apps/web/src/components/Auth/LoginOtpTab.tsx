'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Mail, ShieldCheck, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpCodeInput } from '@/components/Auth/OtpCodeInput';
import { useLocale } from '@/contexts/LocaleContext';
import { requestEmailOtpAction, verifyEmailOtpAction } from '@/data/auth/auth';
import { localizeAuthMessage } from '@/lib/auth/authErrors';
import { OTP_LENGTH, isValidOtp } from '@/lib/auth/otpConfig';

// Same gold action button as the password tab and the public pages.
const SUBMIT =
  'jt-btn-shine h-11 w-full rounded-none bg-[var(--jt-gold-500)] text-[14px] font-medium text-[#0a0a0a] shadow-none hover:bg-[var(--jt-gold-400)]';

/**
 * Inline OTP login flow for the /login Tabs panel. Sends a 6–8 digit code
 * (length per env) on submit, then verifies. Replaces the magic-link tab.
 */
export function LoginOtpTab({ next }: { next?: string }) {
  const { t, dir, locale } = useLocale();
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await requestEmailOtpAction({ email: email.trim(), mode: 'login' });
      if (r?.serverError) throw new Error(localizeAuthMessage(r.serverError, locale));
      if (r?.validationErrors) {
        throw new Error(t('البريد الإلكتروني غير صالح', 'Enter a valid email address.'));
      }
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('تعذّر إرسال الرمز', 'Failed to send code'));
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    setError(null);
    setBusy(true);
    try {
      const r = await verifyEmailOtpAction({ email: email.trim(), token: value });
      const validationMsg = r?.validationErrors
        ? Object.values(r.validationErrors)
            .flatMap((v: unknown) =>
              v && typeof v === 'object' && '_errors' in v && Array.isArray((v as { _errors: string[] })._errors)
                ? (v as { _errors: string[] })._errors
                : [],
            )
            .find(Boolean)
        : undefined;
      const rawMsg = r?.serverError ?? validationMsg;
      if (rawMsg) {
        const text = String(rawMsg);
        throw new Error(
          /Token has expired|invalid|otp/i.test(text)
            ? t('الرمز غير صحيح أو انتهت صلاحيته', 'Code is incorrect or expired. Try again or resend.')
            : text,
        );
      }
      router.push(next ?? '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('الرمز غير صحيح', 'Invalid code'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir={dir} className="space-y-4">
      <AnimatePresence mode="wait" initial={false}>
        {step === 'email' ? (
          <motion.form
            key="e"
            onSubmit={sendCode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="otp-email" className="text-[13px] font-medium text-[var(--jt-stone-800)]">{t('البريد الإلكتروني', 'Email address')}</Label>
              <Input
                id="otp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
                className="h-11 rounded-none border-black/20 bg-white shadow-none focus-visible:border-[#0a0a0a] focus-visible:ring-0"
              />
            </div>
            {error && (
              <div role="alert" className="border border-[var(--jt-terra-200)] bg-[var(--jt-terra-50)] p-3 text-sm text-[var(--jt-terra-700)]">{error}</div>
            )}
            <Button
              type="submit"
              disabled={busy || !email.trim()}
              className={SUBMIT}
            >
              {busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : <Mail className="me-2 h-4 w-4" />}
              {t('أرسل الرمز', `Send ${OTP_LENGTH}-digit code`)}
            </Button>
          </motion.form>
        ) : (
          <motion.div
            key="c"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <p className="text-center text-xs text-[var(--jt-stone-500)]">
              {t(`أرسلنا الرمز إلى ${email}`, `Sent a code to ${email}`)}
            </p>
            <OtpCodeInput value={code} onChange={setCode} onComplete={verify} length={OTP_LENGTH} disabled={busy} />
            {error && (
              <div role="alert" className="border border-[var(--jt-terra-200)] bg-[var(--jt-terra-50)] p-3 text-center text-sm text-[var(--jt-terra-700)]">{error}</div>
            )}
            <Button
              type="button"
              onClick={() => verify(code)}
              disabled={busy || !isValidOtp(code)}
              className={SUBMIT}
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
    </div>
  );
}
