'use client';

import { useState } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { T } from '@/components/ui/Typography';
import { useLocale } from '@/contexts/LocaleContext';
import { cn } from '@/lib/utils';
import type { Person } from '@/types/database';

import { AddChildForm } from './AddChildForm';
import { AddChildrenTable } from './AddChildrenTable';

interface Props {
  readonly treeId: string;
  readonly fatherId: string;
  readonly persons: readonly Person[];
}

/** Card wrapping single-child or multi-child add forms on a father's person page. */
export function AddChildCard({ treeId, fatherId, persons }: Props) {
  const { t } = useLocale();
  const [mode, setMode] = useState<'single' | 'table'>('single');

  return (
    <Card>
      <CardHeader className="space-y-3">
        <T.H3>{t('إضافة ابن/ابنة', 'Add a child')}</T.H3>
        <div
          role="tablist"
          aria-label={t('طريقة الإضافة', 'Entry mode')}
          className="flex w-fit flex-wrap gap-1 rounded-full border border-[var(--jt-olive-200)]/60 bg-[var(--jt-stone-50)]/80 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'single'}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold transition',
              mode === 'single'
                ? 'bg-[var(--jt-olive-700)] text-[var(--jt-stone-50)]'
                : 'text-[var(--jt-stone-600)] hover:bg-[var(--jt-stone-100)]',
            )}
            onClick={() => setMode('single')}
          >
            {t('فردي', 'Single')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'table'}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold transition',
              mode === 'table'
                ? 'bg-[var(--jt-olive-700)] text-[var(--jt-stone-50)]'
                : 'text-[var(--jt-stone-600)] hover:bg-[var(--jt-stone-100)]',
            )}
            onClick={() => setMode('table')}
          >
            {t('جدول متعدد', 'Multi-child table')}
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {mode === 'single' ? (
          <AddChildForm treeId={treeId} fatherId={fatherId} persons={persons} />
        ) : (
          <AddChildrenTable treeId={treeId} fatherId={fatherId} persons={persons} />
        )}
      </CardContent>
    </Card>
  );
}
