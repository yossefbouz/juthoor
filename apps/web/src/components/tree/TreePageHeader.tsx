'use client';

import Link from 'next/link';
import { Plus, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { T } from '@/components/ui/Typography';
import { useLocale } from '@/contexts/LocaleContext';

import { ExportGedcomButton } from './ExportGedcomButton';
import { ImportGedcomDialog } from './ImportGedcomDialog';

interface Props {
  readonly treeId: string;
  readonly treeName: string;
  readonly treeDescription: string | null;
}

/** Tree page header — title, description, and the primary action row. */
export function TreePageHeader({ treeId, treeName, treeDescription }: Props) {
  const { t, dir } = useLocale();

  return (
    <header dir={dir} className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <T.H1>{treeName}</T.H1>
        <T.P className="text-muted-foreground">
          {treeDescription
            ?? t('شجرتك العائلية — أضف نفسك أولاً، ثم الوالدين والأقارب.', 'Your family tree — add yourself first, then parents and relatives.')}
        </T.P>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/tree/${treeId}/add-person`}>
          <Button className="gap-1.5">
            <Plus className="h-4 w-4" />
            {t('إضافة شخص', 'Add person')}
          </Button>
        </Link>
        <Link href={`/tree/${treeId}/people`}>
          <Button variant="outline" className="gap-1.5">
            <Users className="h-4 w-4" />
            {t('كل الأشخاص', 'All people')}
          </Button>
        </Link>
        <ImportGedcomDialog treeId={treeId} />
        <ExportGedcomButton treeId={treeId} />
      </div>
    </header>
  );
}
