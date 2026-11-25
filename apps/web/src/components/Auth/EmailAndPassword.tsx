import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useLocale } from '@/contexts/LocaleContext';
import { Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { ComponentProps } from 'react';

// Square, paper-and-ink fields and the gold action button of the public pages.
const FIELD =
  'h-11 rounded-none border-black/20 bg-white shadow-none has-[[data-slot=input-group-control]:focus-visible]:border-[#0a0a0a] has-[[data-slot=input-group-control]:focus-visible]:ring-0';
const SUBMIT =
  'jt-btn-shine h-11 w-full rounded-none bg-[var(--jt-gold-500)] text-[14px] font-medium text-[#0a0a0a] shadow-none hover:bg-[var(--jt-gold-400)]';

export const EmailAndPassword = ({
  onSubmit,
  view,
  isLoading,
}: {
  onSubmit: (data: { email: string; password: string }) => void;
  view: 'sign-in' | 'sign-up';
  isLoading: boolean;
} & ComponentProps<typeof Button>) => {
  const { t } = useLocale();
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          email,
          password,
        });
      }}
      data-testid="password-form"
    >
      <div className="space-y-4">
        <div>
          <Label htmlFor={`${view}-email`} className="text-[13px] font-medium text-[var(--jt-stone-800)]">
            {t('البريد الإلكتروني', 'Email address')}
          </Label>
          <div className="mt-1">
            <InputGroup className={FIELD}>
              <InputGroupAddon>
                <Mail className="h-4 w-4" />
              </InputGroupAddon>
              <InputGroupInput
                id={`${view}-email`}
                name="email"
                type="email"
                disabled={isLoading}
                value={email}
                data-strategy="email-password"
                placeholder="placeholder@email.com"
                onChange={(event) => setEmail(event.target.value)}
                autoComplete={'email'}
                required
              />
            </InputGroup>
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${view}-password`} className="text-[13px] font-medium text-[var(--jt-stone-800)]">
            {t('كلمة السر', 'Password')}
          </Label>
          <div className="mt-1">
            <InputGroup className={FIELD}>
              <InputGroupAddon>
                <Lock className="h-4 w-4" />
              </InputGroupAddon>
              <InputGroupInput
                id={`${view}-password`}
                name="password"
                type="password"
                disabled={isLoading}
                value={password}
                placeholder={t('اكتب كلمة السر', 'Type your password')}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={
                  view === 'sign-in' ? 'current-password' : 'new-password'
                }
                required
              />
            </InputGroup>
          </div>
        </div>

        <div className="flex items-center justify-between">
          {view === 'sign-in' ? (
            <div className="text-sm">
              <Link
                href="/forgot-password"
                className="font-medium text-[var(--jt-stone-600)] underline-offset-4 hover:text-[#0a0a0a] hover:underline"
              >
                {t('نسيت كلمة السر؟', 'Forgot your password?')}
              </Link>
            </div>
          ) : null}
        </div>
        <div className="space-y-4">
          <Button disabled={isLoading} type="submit" className={SUBMIT}>
            {isLoading ? (
              <>
                <Spinner className="h-4 w-4 me-2" />
                <span>{t('جارٍ التحميل...', 'Loading...')}</span>
              </>
            ) : (
              <span>{view === 'sign-in' ? t('تسجيل الدخول', 'Login') : t('إنشاء حساب', 'Sign up')}</span>
            )}
          </Button>
          <div className="w-full text-center">
            {view === 'sign-in' ? (
              <div className="text-sm">
                <Link
                  href="/sign-up"
                  className="font-medium text-[var(--jt-stone-600)] underline-offset-4 hover:text-[#0a0a0a] hover:underline"
                >
                  {t('ليس لديك حساب؟ أنشئ واحدًا', "Don't have an account? Sign up")}
                </Link>
              </div>
            ) : (
              <div className="text-sm">
                <Link
                  href="/login"
                  className="font-medium text-[var(--jt-stone-600)] underline-offset-4 hover:text-[#0a0a0a] hover:underline"
                >
                  {t('لديك حساب؟ سجّل الدخول', 'Already have an account? Log in')}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </form>
  );
};
