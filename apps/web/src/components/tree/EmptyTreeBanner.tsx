'use client';

import Link from 'next/link';
import { Plus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/contexts/LocaleContext';

/** Shown on `/tree/[treeId]` when the tree has no persons yet. */
export function EmptyTreeBanner({ treeId }: { readonly treeId: string }) {
  const { t, dir } = useLocale();

  return (
    <div dir={dir} className="flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/30 p-12 text-center md:p-20">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--jt-olive-600)] text-[var(--jt-stone-50)]">
        <Users className="h-7 w-7" />
      </div>
      <div className="space-y-2">
        <h2
          className="text-3xl font-bold text-[var(--jt-olive-900)] md:text-4xl"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('لا تزال شجرتك فارغة', 'Your tree is still empty')}
        </h2>
        <p className="mx-auto max-w-md text-[var(--jt-stone-700)]" style={{ lineHeight: 1.9 }}>
          {t(
            'ابدأ بإضافة نفسك أو فردًا تعرفه من العائلة. ستنمو الشجرة معك خطوة بخطوة.',
            'Start by adding yourself or someone you know from the family. The tree will grow with you, step by step.',
          )}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
        <Link href={`/tree/${treeId}/add-self`}>
          <Button size="lg" className="gap-2">
            <Plus className="h-4 w-4" />
            {t('أضف نفسك', 'Add yourself')}
          </Button>
        </Link>
        <Link href={`/tree/${treeId}/add-person`}>
          <Button size="lg" variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            {t('أضف فردًا آخر', 'Add someone else')}
          </Button>
        </Link>
      </div>
    </div>
  );
}
