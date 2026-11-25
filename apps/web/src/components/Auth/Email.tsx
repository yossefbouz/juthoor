'use client';
import { T } from '@/components/ui/Typography';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale } from '@/contexts/LocaleContext';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export const Email = ({
  onSubmit,
  view,
  isLoading,
  successMessage,
  label,
  defaultValue,
  className,
  style,
}: {
  onSubmit: (email: string) => void;
  view: 'sign-in' | 'sign-up' | 'update-email' | 'forgot-password';
  isLoading: boolean;
  successMessage?: string | null | undefined;
  label?: string;
  defaultValue?: string;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const { t } = useLocale();
  const [email, setEmail] = useState<string>(defaultValue ?? '');

  const buttonLabelText = useMemo(() => {
    switch (view) {
      case 'sign-in':
        return t('ادخل برابط سحري', 'Login with Magic Link');
      case 'sign-up':
        return t('أنشئ حسابًا برابط سحري', 'Sign up with Magic Link');
      case 'update-email':
        return t('تحديث البريد الإلكتروني', 'Update Email');
      case 'forgot-password':
        return t('إعادة تعيين كلمة السر', 'Reset password');
    }
  }, [view, t]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(email);
      }}
      data-testid="magic-link-form"
      className={className}
      style={style}
    >
      <div className="space-y-2">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-muted-foreground">
            {label ?? t('البريد الإلكتروني', 'Email address')}
          </Label>
          <div>
            <Input
              id={`${view}-email`}
              name="email"
              type="email"
              value={email}
              disabled={isLoading}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete={'email'}
              placeholder="placeholder@email.com"
              required
              className="h-11 rounded-none border-black/20 bg-white shadow-none focus-visible:border-[#0a0a0a] focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          {view === 'forgot-password' ? (
            <div className="text-sm">
              <Link
                href="/login"
                className="font-medium text-[var(--jt-stone-600)] underline-offset-4 hover:text-[#0a0a0a] hover:underline"
              >
                {t('تسجيل الدخول بدلًا من ذلك؟', 'Log in instead?')}
              </Link>
            </div>
          ) : null}
        </div>
        <div>
          <Button className="jt-btn-shine h-11 w-full rounded-none bg-[var(--jt-gold-500)] text-[14px] font-medium text-[#0a0a0a] shadow-none hover:bg-[var(--jt-gold-400)]" type="submit">
            {buttonLabelText}
          </Button>
        </div>
        <div>
          {successMessage ? (
            <T.P className="text-green-500 dark:text-green-400 text-center">
              {successMessage}
            </T.P>
          ) : null}
        </div>
      </div>
    </form>
  );
};
