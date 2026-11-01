'use client';

import { useState } from 'react';
import { Check, EyeOff, Inbox, Link2, Loader2, ShieldAlert, ShieldOff, Undo2, X } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import {
  acceptConnection,
  declineConnection,
  revokeAutoLink,
  setPrivacyHold,
  type ConnectionCard,
  type ConnectionField,
  type ConnectionVerdict,
} from '@/data/user/hints';

const FIELD_LABEL: Record<string, { ar: string; en: string }> = {
  given: { ar: 'الاسم الأول', en: 'Given' },
  surname: { ar: 'العائلة', en: 'Surname' },
  father: { ar: 'الأب', en: 'Father' },
  mother: { ar: 'الأم', en: 'Mother' },
  pgf: { ar: 'الجد لأب', en: 'Pat. GF' },
  pgm: { ar: 'الجدة لأب', en: 'Pat. GM' },
  mgf: { ar: 'الجد لأم', en: 'Mat. GF' },
  mgm: { ar: 'الجدة لأم', en: 'Mat. GM' },
  spouse: { ar: 'الزوج/ة', en: 'Spouse' },
  origin: { ar: 'الأصل', en: 'Origin' },
  birth_year: { ar: 'سنة الميلاد', en: 'Birth yr' },
  birth_place: { ar: 'مكان الميلاد', en: 'Birthplace' },
  death_year: { ar: 'سنة الوفاة', en: 'Death yr' },
  death_place: { ar: 'مكان الوفاة', en: 'Death place' },
  email: { ar: 'البريد', en: 'Email' },
  num_children: { ar: 'الأبناء', en: 'Children' },
};

const VERDICT_STYLE: Record<ConnectionVerdict, string> = {
  agree: 'border-emerald-300/70 bg-emerald-50 text-emerald-800',
  disagree: 'border-rose-300/70 bg-rose-50 text-rose-800',
  missing: 'border-[var(--jt-stone-200)] bg-[var(--jt-stone-50)] text-[var(--jt-stone-500)]',
};

function Chip({ field, verdict }: ConnectionField) {
  const { t } = useLocale();
  const label = FIELD_LABEL[field] ?? { ar: field, en: field };
  const mark = verdict === 'agree' ? '✓' : verdict === 'disagree' ? '✕' : '–';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${VERDICT_STYLE[verdict]}`}
    >
      <span aria-hidden>{mark}</span>
      {t(label.ar, label.en)}
    </span>
  );
}

export function ConnectionsClient({
  initialConnections,
}: {
  initialConnections: ConnectionCard[];
}) {
  const { t, dir, locale } = useLocale();
  const [cards, setCards] = useState<ConnectionCard[]>(initialConnections);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const viewerName = (c: ConnectionCard): string => {
    const primary = locale === 'ar' ? c.viewerNameAr : c.viewerNameEn;
    return primary || c.viewerNameEn || c.viewerNameAr || t('قريبك', 'Your relative');
  };
  const counterpartLabel = (c: ConnectionCard): string =>
    locale === 'ar' ? c.counterpartLabelAr : c.counterpartLabelEn;

  async function act(
    hintId: string,
    fn: () => Promise<void>,
    remove: boolean,
    nextStatus?: ConnectionCard['hintStatus'],
  ) {
    setBusyId(hintId);
    setError(null);
    try {
      await fn();
      setCards((rows) =>
        remove
          ? rows.filter((r) => r.hintId !== hintId)
          : rows.map((r) => (r.hintId === hintId && nextStatus ? { ...r, hintStatus: nextStatus } : r)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : t('فشل الإجراء.', 'Action failed.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div dir={dir} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 md:p-8">
      <header>
        <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
          <Link2 className="h-3.5 w-3.5" />
          {t('روابط عائلية', 'Family connections')}
        </span>
        <h1
          className="text-3xl font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('روابط محتملة بين شجرتك وأخرى', 'Possible links between your tree and another')}
        </h1>
        <p className="mt-1 text-sm text-[var(--jt-stone-600)]">
          {t(
            'الروابط القوية تُنشأ تلقائيًا ويمكنك إلغاء أي رابط. الروابط الأضعف تنتظر موافقة الطرفين. تفاصيل الطرف الآخر تبقى محجوبة.',
            'Strong matches are linked automatically, and you can revoke any link. Weaker matches wait for both sides to agree. The other side’s details stay hidden.',
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
            {t('لا توجد روابط محتملة حاليًا.', 'No possible connections right now.')}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {cards.map((card) => {
            const busy = busyId === card.hintId;
            const pending = card.hintStatus === 'pending';
            return (
              <li
                key={card.hintId}
                className="rounded-2xl border border-[var(--jt-olive-200)]/60 bg-white/90 p-4 shadow-sm md:p-5"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--jt-stone-400)]">
                      {t('قريبك', 'Your relative')}
                    </p>
                    <p className="truncate text-base font-semibold text-[var(--jt-olive-900)]">
                      {viewerName(card)}
                    </p>
                  </div>
                  <Link2 className="h-4 w-4 shrink-0 text-[var(--jt-stone-400)]" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--jt-stone-400)]">
                      {t('في شجرة أخرى', 'In another tree')}
                    </p>
                    <p className="flex items-center gap-1.5 truncate text-base font-semibold text-[var(--jt-stone-700)]">
                      {card.counterpartMasked && <EyeOff className="h-3.5 w-3.5 shrink-0 text-[var(--jt-stone-400)]" />}
                      {counterpartLabel(card)}
                    </p>
                  </div>
                </div>

                {card.livingInvolved && (
                  <div className="mt-3">
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {t('يشمل شخصًا حيًّا — التفاصيل محجوبة', 'Involves a living person — details hidden')}
                    </span>
                  </div>
                )}

                {card.fields.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {card.fields.map((f) => (
                      <Chip key={f.field} {...f} />
                    ))}
                  </div>
                ) : (
                  !card.livingInvolved && (
                    <p className="mt-3 text-xs text-[var(--jt-stone-400)]">
                      {t('لا تفاصيل حقلية متاحة.', 'No field details available.')}
                    </p>
                  )
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--jt-stone-100)] pt-4">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      act(card.hintId, () => setPrivacyHold({ personId: card.viewerPersonId }), true)
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--jt-stone-500)] transition hover:text-[var(--jt-stone-800)] disabled:opacity-50"
                    title={t('عدم مطابقة قريبك مستقبلًا', 'Stop matching your relative in future')}
                  >
                    <ShieldOff className="h-3.5 w-3.5" />
                    {t('لا تطابق قريبي', "Don't match my relative")}
                  </button>

                  {card.autoLinked ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[var(--jt-olive-200)] bg-[var(--jt-olive-50)] px-3 py-1 text-xs font-medium text-[var(--jt-olive-700)]">
                        {t('رُبط تلقائيًا', 'Linked automatically')}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          act(card.hintId, () => revokeAutoLink({ matchId: card.matchId }), true)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                        {t('إلغاء الربط', 'Revoke link')}
                      </button>
                    </div>
                  ) : pending ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          act(card.hintId, () => declineConnection({ hintId: card.hintId }), true)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        {t('ليس نفس الشخص', 'Not the same')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          act(card.hintId, () => acceptConnection({ hintId: card.hintId }), false, 'accepted')
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--jt-olive-600)] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[var(--jt-olive-700)] disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        {t('نعم، نفس الشخص', 'Yes, same person')}
                      </button>
                    </div>
                  ) : (
                    <span className="rounded-full border border-[var(--jt-olive-200)] bg-[var(--jt-olive-50)] px-3 py-1 text-xs font-medium text-[var(--jt-olive-700)]">
                      {card.hintStatus === 'accepted'
                        ? t('قبلتَ — بانتظار الطرف الآخر', 'You accepted — awaiting the other side')
                        : t('رُفض', 'Declined')}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
