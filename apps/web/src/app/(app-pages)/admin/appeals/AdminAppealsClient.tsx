'use client';

import { useState } from 'react';
import { Check, Inbox, Loader2, Scale, X } from 'lucide-react';

import { AdminStaffNav } from '@/components/admin/AdminStaffNav';
import { useLocale } from '@/contexts/LocaleContext';
import {
  resolveAppeal,
  type VerificationAppeal,
} from '@/data/admin/appeals';

/**
 * Admin UI for verification appeals. Moderators can read; admins resolve.
 * Accepting an appeal re-opens the verification as pending for re-review.
 */
export function AdminAppealsClient({
  initialAppeals,
  isAdmin = true,
}: {
  readonly initialAppeals: VerificationAppeal[];
  readonly isAdmin?: boolean;
}) {
  const { t, dir, locale } = useLocale();
  const [rows, setRows] = useState(initialAppeals);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, accept: boolean) {
    setBusyId(id);
    setError(null);
    try {
      await resolveAppeal({
        id,
        accept,
        note: notes[id]?.trim() || undefined,
      });
      setRows((list) => list.filter((r) => r.id !== id));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t('فشل الإجراء. قد تحتاج صلاحية مشرف.', 'Action failed. Admin rights may be required.'),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div dir={dir} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 md:p-8">
      <AdminStaffNav isAdmin={isAdmin} />
      <header>
        <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
          <Scale className="h-3.5 w-3.5" />
          {t('استئنافات', 'Appeals')}
        </span>
        <h1
          className="text-3xl font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('استئنافات توثيق الهوية', 'Identity verification appeals')}
        </h1>
        <p className="mt-1 text-sm text-[var(--jt-stone-600)]">
          {t(
            'قبول الاستئناف يعيد الطلب إلى قيد المراجعة. المشرفون يقرؤون؛ القرار للمشرف العام.',
            'Accepting an appeal reopens the verification for review. Moderators can read; admins decide.',
          )}
        </p>
      </header>

      {error ? (
        <div className="rounded-xl bg-[var(--jt-terra-50)] p-3 text-sm text-[var(--jt-terra-700)]">
          {error}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/30 p-12 text-center">
          <Inbox className="mx-auto mb-3 h-8 w-8 text-[var(--jt-stone-400)]" />
          <p className="text-sm text-[var(--jt-stone-600)]">
            {t('لا استئنافات مفتوحة.', 'No open appeals.')}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {rows.map((a) => (
            <li
              key={a.id}
              className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-[var(--jt-olive-900)]">
                    {a.appellant_name ?? t('مستخدم', 'User')}
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--jt-stone-500)]">
                    {new Date(a.created_at).toLocaleDateString(
                      locale === 'ar' ? 'ar' : 'en',
                    )}
                  </p>
                </div>
                {isAdmin ? (
                  <div dir="ltr" className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => decide(a.id, false)}
                      disabled={busyId === a.id}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--jt-terra-200)] px-3 py-1.5 text-xs font-semibold text-[var(--jt-terra-700)] transition-colors hover:bg-[var(--jt-terra-50)] disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t('رفض', 'Reject')}
                    </button>
                    <button
                      type="button"
                      onClick={() => decide(a.id, true)}
                      disabled={busyId === a.id}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--jt-olive-700)] px-3 py-1.5 text-xs font-semibold text-[var(--jt-stone-50)] transition-colors hover:bg-[var(--jt-olive-800)] disabled:opacity-50"
                    >
                      {busyId === a.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      {t('قبول وإعادة فتح', 'Accept & reopen')}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--jt-stone-500)]">
                    {t('القراءة فقط للمشرف', 'Read-only for moderators')}
                  </p>
                )}
              </div>
              <p
                className="mt-3 rounded-xl bg-[var(--jt-stone-50)] p-3 text-sm text-[var(--jt-stone-700)]"
                style={{ lineHeight: 1.7 }}
              >
                {a.reason}
              </p>
              <label className="mt-3 block text-sm">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--jt-stone-500)]">
                  {t('ملاحظة الفريق (اختياري)', 'Staff note (optional)')}
                </span>
                <textarea
                  value={notes[a.id] ?? ''}
                  onChange={(e) =>
                    setNotes((m) => ({ ...m, [a.id]: e.target.value }))
                  }
                  rows={2}
                  className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--jt-olive-400)]"
                  placeholder={t('سبب القرار…', 'Decision rationale…')}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
