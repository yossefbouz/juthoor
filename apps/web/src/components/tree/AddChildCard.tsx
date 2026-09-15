'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { T } from '@/components/ui/Typography';
import { useLocale } from '@/contexts/LocaleContext';
import type { Person } from '@/types/database';

import { AddChildForm } from './AddChildForm';

interface Props {
  readonly treeId: string;
  readonly fatherId: string;
  readonly persons: readonly Person[];
}

/** Card wrapping the inline "add a child" form on a father's person page. */
export function AddChildCard({ treeId, fatherId, persons }: Props) {
  const { t } = useLocale();

  return (
    <Card>
      <CardHeader>
        <T.H3>{t('إضافة ابن/ابنة', 'Add a child')}</T.H3>
      </CardHeader>
      <CardContent>
        <AddChildForm treeId={treeId} fatherId={fatherId} persons={persons} />
      </CardContent>
    </Card>
  );
}
