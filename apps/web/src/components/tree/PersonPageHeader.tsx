'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { T } from '@/components/ui/Typography';
import { useLocale } from '@/contexts/LocaleContext';
import { PersonAvatar } from '@/components/person/PersonAvatar';
import type { Person } from '@/types/database';

import { UpgradePlaceholderDialog } from './UpgradePlaceholderDialog';

interface Props {
  readonly treeId: string;
  readonly person: Person;
  readonly photoUrl: string | null | undefined;
  readonly allPersons: readonly Person[];
}

/** `/tree/[treeId]/person/[personId]` header — avatar, name, and the action row. */
export function PersonPageHeader({ treeId, person, photoUrl, allPersons }: Props) {
  const { t, dir, locale } = useLocale();

  const displayName =
    (locale === 'ar'
      ? person.display_name_ar ?? person.display_name_en
      : person.display_name_en ?? person.display_name_ar)
    ?? '—';
  const secondaryName = locale === 'ar' ? person.display_name_en : person.display_name_ar;

  return (
    <header dir={dir} className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-center gap-4">
        <PersonAvatar name={displayName} photoUrl={photoUrl} size={72} />
        <div className="space-y-1">
          <T.H1>{displayName}</T.H1>
          {person.display_name_en && person.display_name_ar ? (
            <T.P className="text-muted-foreground">{secondaryName}</T.P>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {person.notes === 'placeholder' ? (
          <UpgradePlaceholderDialog
            treeId={treeId}
            placeholder={person}
            allPersons={allPersons}
          />
        ) : null}
        <Link href={`/tree/${treeId}`}>
          <Button variant="outline">{t('عرض الشجرة', 'View tree')}</Button>
        </Link>
        <Link href={`/tree/${treeId}/add-person`}>
          <Button>{t('إضافة شخص', 'Add person')}</Button>
        </Link>
      </div>
    </header>
  );
}
