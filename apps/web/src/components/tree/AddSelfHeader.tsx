'use client';

import { T } from '@/components/ui/Typography';
import { useLocale } from '@/contexts/LocaleContext';

/** Header for the "add yourself" onboarding step. */
export function AddSelfHeader() {
  const { t, dir } = useLocale();

  return (
    <header dir={dir} className="space-y-1">
      <T.H1>{t('أضف نفسك', 'Add yourself')}</T.H1>
      <T.P className="text-muted-foreground">
        {t('ابدأ بإدخال معلوماتك الأساسية. يمكنك إضافة الأقارب لاحقًا.', 'Start by entering your basic details. You can add relatives later.')}
      </T.P>
    </header>
  );
}
