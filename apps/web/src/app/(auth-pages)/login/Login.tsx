'use client';
import { LoginOtpTab } from '@/components/Auth/LoginOtpTab';
import { EmailAndPassword } from '@/components/Auth/EmailAndPassword';
import { RedirectingPleaseWaitCard } from '@/components/Auth/RedirectingPleaseWaitCard';
import { RenderProviders } from '@/components/Auth/RenderProviders';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  signInWithPasswordAction,
  signInWithProviderAction,
} from '@/data/auth/auth';
import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { headingFont } from '@/components/home/homeContent';
import { useLocale } from '@/contexts/LocaleContext';
import { localizeAuthMessage } from '@/lib/auth/authErrors';
import { OTP_LENGTH } from '@/lib/auth/otpConfig';
import type { SocialProvider } from '@/lib/auth/socialProviders';

export function Login({
  next,
  nextActionType: _nextActionType,
  closed = false,
  providers,
}: {
  next?: string;
  nextActionType?: string;
  closed?: boolean;
  /** Social providers enabled on the Supabase project; none hides the tab. */
  providers: SocialProvider[];
}) {
  const { t, dir, locale } = useLocale();
  const hasSocial = providers.length > 0;
  const [redirectInProgress, setRedirectInProgress] = useState(false);
  const toastRef = useRef<string | number | undefined>(undefined);
  // useAction keeps the callbacks from the first render, when the language is
  // still the default; read the current one through a ref.
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  // Render the form client-side only. Form-filler browser extensions
  // stamp attributes (fdprocessedid) onto SSR'd inputs before React
  // hydrates, which breaks hydration and cascades into insertBefore /
  // hooks-order crashes inside the animated tabs. With no SSR'd form
  // there is nothing to corrupt.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const router = useRouter();

  function redirectToDashboard() {
    if (next) {
      router.push(`/auth/callback?next=${encodeURIComponent(next)}`);
    } else {
      router.push('/dashboard');
    }
  }

  const { execute: executePassword, status: passwordStatus } = useAction(
    signInWithPasswordAction,
    {
      onExecute: () => {
        toastRef.current = toast.loading(t('جارٍ تسجيل الدخول...', 'Logging in...'));
      },
      onSuccess: () => {
        toast.success(t('تم تسجيل الدخول!', 'Logged in!'), {
          id: toastRef.current,
        });
        toastRef.current = undefined;
        redirectToDashboard();
        setRedirectInProgress(true);
      },
      onError: ({ error }) => {
        const errorMessage = error.serverError
          ? localizeAuthMessage(error.serverError, localeRef.current)
          : t('فشل تسجيل الدخول', 'Failed to login');
        toast.error(errorMessage, {
          id: toastRef.current,
        });
        toastRef.current = undefined;
      },
    }
  );

  const { execute: executeProvider, status: providerStatus } = useAction(
    signInWithProviderAction,
    {
      onExecute: () => {
        toastRef.current = toast.loading(t('جارٍ طلب تسجيل الدخول...', 'Requesting login...'));
      },
      onSuccess: (payload) => {
        toast.success(t('جارٍ التحويل...', 'Redirecting...'), {
          id: toastRef.current,
        });
        toastRef.current = undefined;
        window.location.href = payload.data?.url || '/';
      },
      onError: () => {
        toast.error(t('فشل تسجيل الدخول', 'Failed to login'), {
          id: toastRef.current,
        });
        toastRef.current = undefined;
      },
    }
  );

  if (!mounted) {
    return (
      <div className="mx-auto min-h-[520px] w-full max-w-md" aria-busy="true" />
    );
  }

  const isAR = locale === 'ar';
  // Letter-spacing pulls joined Arabic letters apart, so only Latin text is tracked.
  const eyebrow = isAR ? 'text-[13px]' : 'text-[11px] uppercase tracking-[0.24em]';
  const tabTrigger =
    '-mb-px rounded-none border-b-2 border-transparent bg-transparent px-1 py-3 font-medium text-[var(--jt-stone-500)] shadow-none transition-colors hover:text-[#0a0a0a] data-[state=active]:border-[#0a0a0a] data-[state=active]:bg-transparent data-[state=active]:text-[#0a0a0a] data-[state=active]:shadow-none ' +
    (isAR ? 'text-[14px]' : 'text-[12px] uppercase tracking-[0.18em]');
  const tabHint = 'mb-5 text-[14px] leading-relaxed text-[var(--jt-stone-600)]';

  return (
    <div dir={dir} className="mx-auto w-full max-w-md text-start">
      {redirectInProgress ? (
        <RedirectingPleaseWaitCard
          message={t('انتظر بينما نحوّلك إلى لوحة التحكم.', 'Please wait while we redirect you to your dashboard.')}
          heading={t('جارٍ التحويل إلى لوحة التحكم', 'Redirecting to Dashboard')}
        />
      ) : (
        <div className="min-h-[520px] border border-black/10 bg-white p-7 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.35)] sm:p-9">
          <p className={`${eyebrow} font-medium text-[var(--jt-gold-600)]`}>{t('أهلًا بعودتك', 'Welcome back')}</p>
          <h1
            className="mt-3 text-[1.75rem] font-medium leading-tight text-[#0a0a0a]"
            style={{ fontFamily: headingFont(isAR) }}
          >
            {t('تسجيل الدخول إلى جذور', 'Sign in to Juthoor')}
          </h1>
          {closed ? (
            <p
              role="status"
              className="mt-5 border border-black/15 bg-[var(--jt-stone-50)] px-3 py-2 text-sm text-[var(--jt-stone-700)]"
            >
              {t(
                'تم إغلاق حسابك. بيانات العائلة محفوظة في الأرشيف، ولا يمكن تسجيل الدخول بهذا الحساب مرة أخرى.',
                'Your account is closed. Family data stays in the archive vault, and this login can no longer sign in.',
              )}
            </p>
          ) : null}
          <Tabs defaultValue="password" dir={dir} className="mt-6">
            <TabsList
              className={`grid h-auto w-full rounded-none border-b border-black/15 bg-transparent p-0 ${hasSocial ? 'grid-cols-3' : 'grid-cols-2'}`}
            >
              <TabsTrigger value="password" className={tabTrigger}>{t('كلمة السر', 'Password')}</TabsTrigger>
              <TabsTrigger value="otp" className={tabTrigger}>{t('رمز التحقق', 'Email code')}</TabsTrigger>
              {hasSocial ? (
                <TabsTrigger value="social-login" className={tabTrigger}>{t('التواصل الاجتماعي', 'Social')}</TabsTrigger>
              ) : null}
            </TabsList>
            <TabsContent value="otp" className="mt-6">
              <p className={tabHint}>
                {t(
                  `سنرسل رمزًا من ${OTP_LENGTH} أرقام إلى بريدك.`,
                  `We'll email you an ${OTP_LENGTH}-digit code.`,
                )}
              </p>
              <LoginOtpTab next={next} />
            </TabsContent>
            <TabsContent value="password" className="mt-6">
              <p className={tabHint}>{t('ادخل بحسابك الذي أنشأته لجذور.', 'Login with your Juthoor account.')}</p>
              <EmailAndPassword
                isLoading={passwordStatus === 'executing'}
                onSubmit={(data) => {
                  executePassword({
                    email: data.email,
                    password: data.password,
                  });
                }}
                view="sign-in"
              />
            </TabsContent>

            {/* magic-link tab removed — replaced by the OTP tab above */}
            {hasSocial ? (
              <TabsContent value="social-login" className="mt-6">
                <p className={tabHint}>{t('ادخل عبر أحد حساباتك التالية.', 'Sign in with one of these accounts.')}</p>
                <RenderProviders
                  providers={providers}
                  isLoading={providerStatus === 'executing'}
                  onProviderLoginRequested={(provider) =>
                    executeProvider({ provider, next })
                  }
                />
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      )}
    </div>
  );
}
