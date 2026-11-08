'use client';

import Link from 'next/link';
import { Link2, Network, Users } from 'lucide-react';

import { PftIdentityChart } from '@/components/tree/PftIdentityChart';
import { useLocale } from '@/contexts/LocaleContext';
import type { PftIdentityGroup } from '@/data/user/pft';

export function PftClient({ groups }: { readonly groups: PftIdentityGroup[] }) {
  const { t, dir } = useLocale();

  return (
    <div dir={dir} className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 md:p-8">
      <header>
        <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
          <Network className="h-3.5 w-3.5" />
          {t('الشجرة الفلسطينية', 'Palestinian Family Tree')}
        </span>
        <h1
          className="text-3xl font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('مجموعات الهوية المرتبطة', 'Linked identity groups')}
        </h1>
        <p className="mt-1 text-sm text-[var(--jt-stone-600)]" style={{ lineHeight: 1.7 }}>
          {t(
            'مخطط تفاعلي فوق الروابط المؤكّدة التي تشارك فيها. كل شخص يبقى في شجرته؛ الخطوط المتقطعة تعني نفس الهوية، والخطوط الرمادية للعرض فقط.',
            'Interactive chart over confirmed links you take part in. Each person stays in their own tree; dashed lines mean the same identity, grey lines are layout-only.',
          )}
        </p>
      </header>

      {groups.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/30 p-12 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-[var(--jt-stone-400)]" />
          <p className="text-sm text-[var(--jt-stone-600)]">
            {t(
              'لا توجد روابط مؤكّدة في الشجرات التي يمكنك رؤيتها بعد.',
              'No confirmed links in trees you can see yet.',
            )}
          </p>
          <Link
            href="/dashboard/connections"
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--jt-olive-700)] hover:text-[var(--jt-olive-900)]"
          >
            <Link2 className="h-3.5 w-3.5" />
            {t('راجع الروابط المحتملة', 'Review possible connections')}
          </Link>
        </div>
      ) : (
        <ul className="space-y-8">
          {groups.map((g, index) => (
            <li
              key={g.groupId}
              className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-4 shadow-[var(--jt-shadow-sm)] md:p-5"
            >
              <PftIdentityChart group={g} index={index} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
