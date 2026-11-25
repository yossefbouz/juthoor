'use client';

import Link from 'next/link';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { T } from '@/components/ui/Typography';
import { useLocale } from '@/contexts/LocaleContext';
import type { RelationshipItem } from '@/lib/tree/relationshipFlags';

import { DisputeRelationshipButton } from './DisputeRelationshipButton';

/** AIO2 4.X.1.1.8: Validate / Dispute for each parent, spouse and child of the focus person. */
export function RelationshipsPanel({
  treeId,
  focusPersonId,
  items,
  canResolve,
}: {
  treeId: string;
  focusPersonId: string;
  items: readonly RelationshipItem[];
  /** The viewer can write the tree, so may resolve or dismiss a dispute. */
  canResolve: boolean;
}) {
  const { t, locale } = useLocale();
  if (items.length === 0) return null;

  const roleLabel = {
    father: t('الأب', 'Father'),
    mother: t('الأم', 'Mother'),
    spouse: t('الزوج/الزوجة', 'Spouse'),
    child: t('ابن/ابنة', 'Child'),
  };

  return (
    <Card>
      <CardHeader>
        <T.H3>{t('توثيق صلات القرابة', 'Relationship validation')}</T.H3>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-[var(--jt-stone-200)]">
          {items.map((item) => (
            <li key={`${item.role}:${item.personId}`} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm">
                <span className="text-[var(--jt-stone-500)]">{roleLabel[item.role]}: </span>
                <Link
                  href={`/tree/${treeId}/person/${item.personId}`}
                  className="font-semibold text-[var(--jt-olive-900)] hover:underline"
                >
                  {(locale === 'ar'
                    ? item.nameAr ?? item.nameEn
                    : item.nameEn ?? item.nameAr) ?? '—'}
                </Link>
              </p>
              <DisputeRelationshipButton
                treeId={treeId}
                focusPersonId={focusPersonId}
                relatedPersonId={item.personId}
                relationType={item.relationType}
                initiallyValidated={item.validated}
                openDisputes={item.openDisputes}
                canResolve={canResolve}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
