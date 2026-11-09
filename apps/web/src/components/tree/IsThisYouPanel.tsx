'use client';

import { useState, useTransition } from 'react';
import { Check, Search, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/contexts/LocaleContext';
import { linkMyPersonAction } from '@/data/user/personLink';
import { searchMasterTree } from '@/data/user/search';
import type { SearchResult } from '@/lib/search/zodSchemas';

/** Score threshold for "high confidence" registration match (1.4 / W2.4). */
export const HIGH_CONFIDENCE_SCORE = 0.55;

/**
 * Minimal viable registration-time match on `/tree/.../add-self`.
 * Searches the master tree by the user's name; if a high-confidence hit
 * appears, offers "Is this you?" → sets profiles.linked_person_id.
 */
export function IsThisYouPanel({
  alreadyLinked,
}: {
  alreadyLinked: boolean;
}) {
  const { t, locale, dir } = useLocale();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (alreadyLinked || linkedId) {
    return (
      <div
        dir={dir}
        className="rounded-2xl border border-[var(--jt-olive-200)] bg-[var(--jt-olive-50)]/60 px-4 py-3 text-sm text-[var(--jt-olive-800)]"
      >
        <div className="flex items-center gap-2 font-medium">
          <UserCheck className="h-4 w-4" />
          {t(
            'تم إرسال أو تأكيد ربط حسابك بشخص في الشجرة.',
            'Your account link to a person is requested or confirmed.',
          )}
        </div>
      </div>
    );
  }

  function runSearch() {
    const q = query.trim();
    if (q.length < 2) {
      toast.error(t('أدخل اسمًا للبحث', 'Enter a name to search'));
      return;
    }
    startTransition(async () => {
      try {
        const results = await searchMasterTree({ q, limit: 5, yearWindow: 5 });
        const confident = results.filter((r) => r.score >= HIGH_CONFIDENCE_SCORE);
        setHits(confident.length > 0 ? confident.slice(0, 3) : []);
        setSearched(true);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('فشل البحث', 'Search failed'));
      }
    });
  }

  function confirm(personId: string) {
    startTransition(async () => {
      const result = await linkMyPersonAction({ personId });
      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }
      setLinkedId(personId);
      toast.success(
        t(
          'تم إرسال طلب الربط لمالك الشجرة للموافقة.',
          'Claim request sent to the tree owner for approval.',
        ),
      );
    });
  }

  return (
    <section
      dir={dir}
      className="rounded-2xl border border-[var(--jt-gold-300)]/60 bg-[var(--jt-gold-50)]/40 p-4 shadow-[var(--jt-shadow-sm)]"
    >
      <h2
        className="mb-1 text-base font-bold text-[var(--jt-olive-900)]"
        style={{ fontFamily: 'var(--jt-font-display)' }}
      >
        {t('هل أنت مسجّل مسبقًا؟', 'Already in the tree?')}
      </h2>
      <p className="mb-3 text-sm text-[var(--jt-stone-600)]">
        {t(
          'ابحث باسمك. إن ظهر تطابق قوي، أكّد «هل هذا أنت؟» لربط حسابك.',
          'Search by your name. If a strong match appears, confirm “Is this you?” to link your account.',
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('اسمك الكامل…', 'Your full name…')}
          className="max-w-sm flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              runSearch();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={runSearch} disabled={isPending}>
          <Search className="h-4 w-4" />
          {isPending ? t('جارٍ البحث…', 'Searching…') : t('بحث', 'Search')}
        </Button>
      </div>

      {searched && hits.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--jt-stone-500)]">
          {t(
            'لا تطابق قوي. يمكنك المتابعة وإضافة نفسك أدناه.',
            'No high-confidence match. Continue and add yourself below.',
          )}
        </p>
      ) : null}

      {hits.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {hits.map((hit) => {
            const name =
              locale === 'ar'
                ? hit.display_name_ar ?? hit.display_name_en ?? hit.primary_given
                : hit.display_name_en ?? hit.display_name_ar ?? hit.primary_given;
            return (
              <li
                key={hit.person_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--jt-olive-200)] bg-[var(--card)] px-3 py-2"
              >
                <div>
                  <p className="font-semibold text-[var(--jt-olive-900)]">{name ?? '—'}</p>
                  <p className="text-xs text-[var(--jt-stone-500)]">
                    {hit.tree_name}
                    {hit.birth_year ? ` · ${hit.birth_year}` : ''}
                    {hit.origin_name_ar || hit.origin_name_en
                      ? ` · ${locale === 'ar' ? hit.origin_name_ar ?? hit.origin_name_en : hit.origin_name_en ?? hit.origin_name_ar}`
                      : ''}
                    {' · '}
                    {t('ثقة', 'score')} {hit.score.toFixed(2)}
                  </p>
                  <p className="mt-1 text-sm font-medium text-[var(--jt-olive-800)]">
                    {t('هل هذا أنت؟', 'Is this you?')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => confirm(hit.person_id)}
                    disabled={isPending}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t('نعم، اربط', 'Yes, link')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setHits((prev) => prev.filter((h) => h.person_id !== hit.person_id))}
                    disabled={isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                    {t('لا', 'No')}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
