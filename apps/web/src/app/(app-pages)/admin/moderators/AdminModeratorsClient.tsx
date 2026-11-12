'use client';

import { useState } from 'react';
import { Loader2, Shield, UserCog } from 'lucide-react';

import { AdminStaffNav } from '@/components/admin/AdminStaffNav';
import { useLocale } from '@/contexts/LocaleContext';
import { setModeratorRole } from '@/data/admin/moderators';

type StaffRow = {
  id: string;
  display_name: string | null;
  display_name_ar: string | null;
  is_admin: boolean;
  is_moderator: boolean;
};

/**
 * Admin-only: appoint or remove moderators by user id, and list current staff.
 */
export function AdminModeratorsClient({
  initialStaff,
}: {
  readonly initialStaff: StaffRow[];
}) {
  const { t, dir } = useLocale();
  const [staff, setStaff] = useState(initialStaff);
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function appoint(makeModerator: boolean) {
    const id = userId.trim();
    if (!id) {
      setError(t('أدخل معرّف المستخدم.', 'Enter a user id.'));
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await setModeratorRole({ userId: id, isModerator: makeModerator });
      setOk(
        makeModerator
          ? t('تم تعيين المشرف.', 'Moderator appointed.')
          : t('تم إزالة صلاحية المشرف.', 'Moderator role removed.'),
      );
      setUserId('');
      if (makeModerator) {
        setStaff((list) => {
          if (list.some((s) => s.id === id)) {
            return list.map((s) =>
              s.id === id ? { ...s, is_moderator: true } : s,
            );
          }
          return [
            ...list,
            {
              id,
              display_name: null,
              display_name_ar: null,
              is_admin: false,
              is_moderator: true,
            },
          ];
        });
      } else {
        setStaff((list) =>
          list
            .map((s) => (s.id === id ? { ...s, is_moderator: false } : s))
            .filter((s) => s.is_admin || s.is_moderator),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('فشل الإجراء.', 'Action failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir={dir} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 md:p-8">
      <AdminStaffNav isAdmin />
      <header>
        <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
          <UserCog className="h-3.5 w-3.5" />
          {t('الفريق', 'Staff')}
        </span>
        <h1
          className="text-3xl font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('تعيين المشرفين', 'Appoint moderators')}
        </h1>
        <p className="mt-1 text-sm text-[var(--jt-stone-600)]">
          {t(
            'المشرف يقرأ طلبات التوثيق وسجل الوصول والاستئنافات. القرار النهائي للمشرف العام.',
            'Moderators can read verifications, access logs, and appeals. Admins decide outcomes.',
          )}
        </p>
      </header>

      <section className="rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)]">
        <label className="block text-sm">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--jt-stone-500)]">
            {t('معرّف المستخدم (UUID)', 'User id (UUID)')}
          </span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            dir="ltr"
            className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--jt-olive-400)]"
            placeholder="00000000-0000-4000-8000-000000000000"
          />
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => appoint(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--jt-olive-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--jt-olive-800)] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
            {t('تعيين مشرف', 'Make moderator')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => appoint(false)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--jt-terra-200)] px-4 py-2 text-sm font-semibold text-[var(--jt-terra-700)] hover:bg-[var(--jt-terra-50)] disabled:opacity-50"
          >
            {t('إزالة المشرف', 'Remove moderator')}
          </button>
        </div>
        {error ? (
          <p className="mt-3 text-sm text-[var(--jt-terra-700)]">{error}</p>
        ) : null}
        {ok ? (
          <p className="mt-3 text-sm text-[var(--jt-olive-700)]">{ok}</p>
        ) : null}
      </section>

      <section>
        <h2
          className="mb-3 text-lg font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('الفريق الحالي', 'Current staff')}
        </h2>
        {staff.length === 0 ? (
          <p className="text-sm text-[var(--jt-stone-500)]">
            {t('لا صفوف بعد.', 'No staff rows yet.')}
          </p>
        ) : (
          <ul className="space-y-2">
            {staff.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--jt-stone-200)] bg-[var(--card)] px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-[var(--jt-olive-900)]">
                    {s.display_name_ar || s.display_name || s.id.slice(0, 8)}
                  </p>
                  <p dir="ltr" className="font-mono text-[11px] text-[var(--jt-stone-500)]">
                    {s.id}
                  </p>
                </div>
                <div className="flex gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
                  {s.is_admin ? (
                    <span className="rounded-full bg-[var(--jt-gold-100)] px-2 py-1 text-[var(--jt-gold-800)]">
                      {t('مشرف عام', 'Admin')}
                    </span>
                  ) : null}
                  {s.is_moderator ? (
                    <span className="rounded-full bg-[var(--jt-olive-100)] px-2 py-1 text-[var(--jt-olive-800)]">
                      {t('مشرف', 'Moderator')}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
