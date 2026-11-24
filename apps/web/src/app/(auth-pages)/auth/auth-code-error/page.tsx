'use client';

import Link from 'next/link';
import { T } from '@/components/ui/Typography';
import { useLocale } from '@/contexts/LocaleContext';

export default function AuthErrorPage() {
  const { t } = useLocale();
  return (
    <div>
      <T.H1>{t('خطأ في تسجيل الدخول', 'Authentication Error')}</T.H1>
      <T.P>
        {t(
          'حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى.',
          'An error occurred during authentication. Please try again.'
        )}
      </T.P>
      <T.P>
        <Link href="/login" className="font-medium underline underline-offset-4">
          {t('العودة إلى تسجيل الدخول', 'Back to login')}
        </Link>
      </T.P>
    </div>
  );
}
