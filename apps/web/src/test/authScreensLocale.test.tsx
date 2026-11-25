import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import AuthErrorPage from '@/app/(auth-pages)/auth/auth-code-error/page';
import { ForgotPassword } from '@/app/(auth-pages)/forgot-password/ForgotPassword';
import { UpdatePassword } from '@/app/(auth-pages)/update-password/UpdatePassword';
import { EmailConfirmationPendingCard } from '@/components/Auth/EmailConfirmationPendingCard';
import { OtpCodeInput } from '@/components/Auth/OtpCodeInput';
import { LocaleProvider } from '@/contexts/LocaleContext';

// Keep the server action modules (and their server-only imports) out of jsdom.
vi.mock('@/data/auth/auth', () => ({ resetPasswordAction: vi.fn() }));
vi.mock('@/data/user/security', () => ({ updatePasswordAction: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** Renders with the language toggle set to `locale` (Arabic is the default). */
function renderIn(locale: 'ar' | 'en', ui: ReactElement) {
  if (locale === 'en') window.localStorage.setItem('juthoor.locale', 'en');
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

const LATIN_LETTERS = /[A-Za-z]{3,}/;

describe('auth screens follow the language toggle', () => {
  it('forgot password', () => {
    renderIn('ar', <ForgotPassword />);
    expect(screen.getByText('نسيت كلمة السر')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'إعادة تعيين كلمة السر' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'تسجيل الدخول بدلًا من ذلك؟' })).not.toBeNull();
    cleanup();

    renderIn('en', <ForgotPassword />);
    expect(screen.getByText('Forgot Password')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Reset password' })).not.toBeNull();
  });

  it('update password', () => {
    const { container } = renderIn('ar', <UpdatePassword />);
    expect(screen.getByText('إعادة تعيين كلمة السر')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'تأكيد كلمة السر' })).not.toBeNull();
    expect(container.textContent).not.toMatch(LATIN_LETTERS);
    cleanup();

    renderIn('en', <UpdatePassword />);
    expect(screen.getByText('Reset Password')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Confirm Password' })).not.toBeNull();
  });

  it('auth code error', () => {
    const { container } = renderIn('ar', <AuthErrorPage />);
    expect(screen.getByText('خطأ في تسجيل الدخول')).not.toBeNull();
    expect(container.textContent).not.toMatch(LATIN_LETTERS);
    cleanup();

    renderIn('en', <AuthErrorPage />);
    expect(screen.getByText('Authentication Error')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Back to login' }).getAttribute('href')).toBe('/login');
  });

  it('email confirmation card', () => {
    const card = (
      <EmailConfirmationPendingCard
        heading="h"
        message="m"
        type="sign-up"
        resetSuccessMessage={vi.fn()}
        resendEmail={vi.fn()}
      />
    );
    renderIn('ar', card);
    expect(screen.getByRole('button', { name: 'العودة إلى إنشاء الحساب' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'اضغط لإعادة الإرسال' })).not.toBeNull();
    cleanup();

    renderIn('en', card);
    expect(screen.getByRole('button', { name: 'Back to sign up' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Click to resend' })).not.toBeNull();
  });

  it('OTP code input labels', () => {
    const input = <OtpCodeInput value="" onChange={vi.fn()} length={6} />;
    renderIn('ar', input);
    expect(screen.getByRole('group', { name: 'رمز التحقق من 6 أرقام' })).not.toBeNull();
    expect(screen.getByLabelText('الرقم 1')).not.toBeNull();
    cleanup();

    // The e2e helpers look the cells up by this English label.
    renderIn('en', input);
    expect(screen.getByRole('group', { name: '6-digit verification code' })).not.toBeNull();
    expect(screen.getByLabelText('digit 1')).not.toBeNull();
  });
});
