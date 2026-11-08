'use client';

import { useState } from 'react';
import {
  Check,
  GitMerge,
  Inbox,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UsersRound,
  X,
} from 'lucide-react';
import { AdminStaffNav } from '@/components/admin/AdminStaffNav';
import { useLocale } from '@/contexts/LocaleContext';
import {
  rescoreMatch,
  resolveMatchAction,
  type ReviewCard,
  type ReviewDecision,
  type ReviewField,
  type FieldVerdict,
} from '@/data/admin/review';

const FIELD_LABEL: Record<string, { ar: string; en: string }> = {
  given: { ar: 'الاسم الأول', en: 'Given' },
  surname: { ar: 'العائلة', en: 'Surname' },
  father: { ar: 'الأب', en: 'Father' },
  mother: { ar: 'الأم', en: 'Mother' },
  pgf: { ar: 'الجد لأب', en: 'Pat. GF' },
  mgf: { ar: 'الجد لأم', en: 'Mat. GF' },
  spouse_first: { ar: 'اسم الزوج/ة', en: 'Spouse first' },
  spouse_family: { ar: 'عائلة الزوج/ة', en: 'Spouse family' },
  origin: { ar: 'الأصل', en: 'Origin' },
  birth_year: { ar: 'سنة الميلاد', en: 'Birth yr' },
  birth_place: { ar: 'مكان الميلاد', en: 'Birthplace' },
  death_year: { ar: 'سنة الوفاة', en: 'Death yr' },
  death_place: { ar: 'مكان الوفاة', en: 'Death place' },
  num_children: { ar: 'الأبناء', en: 'Children' },
};

const VERDICT_STYLE: Record<FieldVerdict, string> = {
  agree: 'border-emerald-300/70 bg-emerald-50 text-emerald-800',
  disagree: 'border-rose-300/70 bg-rose-50 text-rose-800',
  missing: 'border-[var(--jt-stone-200)] bg-[var(--jt-stone-50)] text-[var(--jt-stone-500)]',
};

function Chip({ field, verdict }: ReviewField) {
  const { t } = useLocale();
  const label = FIELD_LABEL[field] ?? { ar: field, en: field };
  const mark = verdict === 'agree' ? '✓' : verdict === 'disagree' ? '✕' : '–';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${VERDICT_STYLE[verdict]}`}
      title={t(
        verdict === 'agree' ? 'متطابق' : verdict === 'disagree' ? 'متعارض' : 'غير متوفر',
        verdict === 'agree' ? 'agrees' : verdict === 'disagree' ? 'disagrees' : 'missing',
      )}
    >
      <span aria-hidden>{mark}</span>
      {t(label.ar, label.en)}
    </span>
  );
}

function PersonCol({
  name,
  treeName,
  isLiving,
}: {
  name: string;
  treeName: string | null;
  isLiving: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2">
        <p className="truncate text-base font-semibold text-[var(--jt-olive-900)]">{name}</p>
        {isLiving && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            <ShieldAlert className="h-3 w-3" />
            {t('حيّ', 'Living')}
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate text-xs text-[var(--jt-stone-500)]">
        {treeName ?? t('شجرة غير معروفة', 'Unknown tree')}
      </p>
    </div>
  );
}

export function AdminReviewClient({ initialCards }: { initialCards: ReviewCard[] }) {
  const { t, dir, locale } = useLocale();
  const [cards, setCards] = useState<ReviewCard[]>(initialCards);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const personName = (p: ReviewCard['personA']): string => {
    const primary = locale === 'ar' ? p.displayNameAr : p.displayNameEn;
    return primary || p.displayNameEn || p.displayNameAr || t('بدون اسم', 'Unnamed');
  };

  async function decide(matchId: string, decision: ReviewDecision) {
    setBusyId(matchId);
    setError(null);
    try {
      await resolveMatchAction({ matchId, decision, note: notes[matchId]?.trim() || undefined });
      setCards((rows) => rows.filter((r) => r.matchId !== matchId));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('فشل الإجراء.', 'Action failed.'));
    } finally {
      setBusyId(null);
    }
  }

  async function recheck(matchId: string) {
    setBusyId(matchId);
    setError(null);
    try {
      const fresh = await rescoreMatch(matchId);
      setCards((rows) =>
        rows.map((r) =>
          r.matchId === matchId
            ? {
                ...r,
                score: fresh.score,
                scorePct: fresh.scorePct,
                decision: fresh.decision,
                vetoes: fresh.vetoes,
                livingInvolved: fresh.livingInvolved || r.livingInvolved,
                fields: fresh.fields,
              }
            : r,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('فشل إعادة التقييم.', 'Re-scoring failed.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div dir={dir} className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 p-4 md:p-8">
      <AdminStaffNav isAdmin />
      <header>
        <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
          <UsersRound className="h-3.5 w-3.5" />
          {t('مراجعة المطابقات', 'Match review')}
        </span>
        <h1
          className="text-3xl font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('طابور المطابقات المقترحة', 'Proposed match queue')}
        </h1>
        <p className="mt-1 text-sm text-[var(--jt-stone-600)]">
          {t(
            'مرتبة حسب الثقة. القرارات لا تُدمج تلقائيًا — كل رابط قابل للتراجع.',
            'Sorted by confidence. Nothing merges automatically — every link is reversible.',
          )}
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-300/70 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {cards.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--jt-stone-200)] bg-[var(--jt-stone-50)]/60 px-6 py-16 text-center">
          <Inbox className="h-8 w-8 text-[var(--jt-stone-400)]" />
          <p className="text-sm font-medium text-[var(--jt-stone-600)]">
            {t('لا توجد مطابقات بانتظار المراجعة.', 'No matches awaiting review.')}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {cards.map((card) => {
            const busy = busyId === card.matchId;
            return (
              <li
                key={card.matchId}
                className="rounded-2xl border border-[var(--jt-olive-200)]/60 bg-white/90 p-4 shadow-sm md:p-5"
              >
                {/* header: the two people + score */}
                <div className="flex flex-wrap items-center gap-3">
                  <PersonCol
                    name={personName(card.personA)}
                    treeName={card.personA.treeName}
                    isLiving={card.personA.isLiving}
                  />
                  <div className="flex shrink-0 flex-col items-center px-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--jt-stone-400)]">
                      {t('مطابقة', 'match')}
                    </span>
                    <span className="text-lg font-bold text-[var(--jt-olive-700)]">
                      {card.score}
                    </span>
                    {card.scorePct != null && (
                      <span className="text-[11px] text-[var(--jt-stone-500)]">
                        {Math.round(card.scorePct * 100)}%
                      </span>
                    )}
                  </div>
                  <PersonCol
                    name={personName(card.personB)}
                    treeName={card.personB.treeName}
                    isLiving={card.personB.isLiving}
                  />
                </div>

                {/* badges: living-involved + engine recommendation + vetoes */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {card.livingInvolved && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {t('يشمل شخصًا حيًّا — سرّية قصوى', 'Living person — max privacy')}
                  {card.perfectMatchBlocked && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-300/70 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800">
                      {t('مطابقة تامة محجوبة بدون دليل الأونروا', 'Perfect match blocked without UNRWA evidence')}
                    </span>
                  )}
                    </span>
                  )}
                  {card.vetoes.map((v) => (
                    <span
                      key={v}
                      className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700"
                    >
                      {v}
                    </span>
                  ))}
                </div>

                {/* per-field agreement chips */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {card.fields.map((f) => (
                    <Chip key={f.field} {...f} />
                  ))}
                </div>

                {/* note + actions */}
                <div className="mt-4 flex flex-col gap-3 border-t border-[var(--jt-stone-100)] pt-4 md:flex-row md:items-center">
                  <input
                    type="text"
                    value={notes[card.matchId] ?? ''}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [card.matchId]: e.target.value }))
                    }
                    placeholder={t('ملاحظة للسجل (اختياري)', 'Note for the log (optional)')}
                    className="min-w-0 flex-1 rounded-lg border border-[var(--jt-stone-200)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--jt-olive-400)]"
                  />
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => recheck(card.matchId)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--jt-stone-200)] px-3 py-2 text-xs font-medium text-[var(--jt-stone-600)] transition hover:bg-[var(--jt-stone-50)] disabled:opacity-50"
                      title={t('إعادة التقييم عبر المحرّك', 'Re-score via the engine')}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
                      {t('إعادة تقييم', 'Re-check')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => decide(card.matchId, 'reject')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t('رفض', 'Reject')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => decide(card.matchId, 'defer')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--jt-olive-200)] px-3 py-2 text-xs font-semibold text-[var(--jt-olive-700)] transition hover:bg-[var(--jt-olive-50)] disabled:opacity-50"
                    >
                      {t('تأجيل للمالكَين', 'Defer to owners')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => decide(card.matchId, 'approve')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--jt-olive-600)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--jt-olive-700)] disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : card.livingInvolved ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <GitMerge className="h-3.5 w-3.5" />
                      )}
                      {card.livingInvolved
                        ? t('اعتماد (يتطلب موافقة المالكَين)', 'Approve (needs both owners)')
                        : t('دمج', 'Merge')}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
