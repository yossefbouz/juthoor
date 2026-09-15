'use client';

import { useLocale } from '@/contexts/LocaleContext';

/** Header for the general "add a person to your tree" page. */
export function AddPersonPageHeader() {
  const { t, dir } = useLocale();

  return (
    <header dir={dir}>
      <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
        {t('إضافة جديدة', 'New addition')}
      </p>
      <h1
        className="text-3xl font-bold text-[var(--jt-olive-900)] md:text-4xl"
        style={{ fontFamily: 'var(--jt-font-display)' }}
      >
        {t('إضافة شخص إلى شجرتك', 'Add a person to your tree')}
      </h1>
      <p className="mt-1 text-sm text-[var(--jt-stone-600)]">
        {t(
          'اختر صلة القرابة أولاً، ثم املأ بياناته. ستظهر معاينة واضحة قبل الحفظ.',
          'Pick the relationship first, then fill in their details. You’ll see a clear preview before saving.',
        )}
      </p>
    </header>
  );
}
