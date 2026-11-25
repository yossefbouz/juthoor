'use client';

import { useAction } from 'next-safe-action/hooks';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { toast } from 'sonner';

import { Password } from '@/components/Auth/Password';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useLocale } from '@/contexts/LocaleContext';
import { updatePasswordAction } from '@/data/user/security';

export function UpdatePassword() {
  const router = useRouter();
  const { t } = useLocale();
  const toastRef = useRef<string | number | undefined>(undefined);

  const { execute, status } = useAction(updatePasswordAction, {
    onExecute: () => {
      toastRef.current = toast.loading(t('جارٍ تحديث كلمة السر...', 'Updating password...'));
    },
    onSuccess: () => {
      toast.success(t('تم تحديث كلمة السر!', 'Password updated!'), {
        id: toastRef.current,
      });
      toastRef.current = undefined;
      router.push('/auth/callback');
    },
    onError: ({ error }) => {
      // Surface the schema's (bilingual) validation message, not just server errors.
      const validationErrors = error.validationErrors as
        | { password?: { _errors?: string[] } }
        | undefined;
      const errorMessage =
        error.serverError ??
        validationErrors?.password?._errors?.[0] ??
        t('تعذّر تحديث كلمة السر', 'Failed to update password');
      toast.error(errorMessage, {
        id: toastRef.current,
      });
      toastRef.current = undefined;
    },
  });

  return (
    <div className="container h-full grid items-center text-start max-w-lg mx-auto overflow-auto">
      <div className="space-y-8 ">
        <Card>
          <CardHeader>
            <CardTitle>{t('إعادة تعيين كلمة السر', 'Reset Password')}</CardTitle>
            <CardDescription>
              {t('اختر كلمة سر جديدة لحسابك.', 'Choose a new password for your account.')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Password
              isLoading={status === 'executing'}
              onSubmit={(password: string) => execute({ password })}
              label={t('أنشئ كلمة السر الجديدة', 'Create your new Password')}
              buttonLabel={t('تأكيد كلمة السر', 'Confirm Password')}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
