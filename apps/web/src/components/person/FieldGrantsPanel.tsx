'use client';

import { useState, useTransition } from 'react';
import { KeyRound, Loader2, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { useLocale } from '@/contexts/LocaleContext';
import {
  grantOptionalFieldsAction,
  revokeOptionalFieldsGrantAction,
  type GrantCandidate,
  type PersonFieldGrantRow,
} from '@/data/user/personFieldGrants';

/**
 * D1 / R12: record owner (or admin) grants tree collaborators write access to
 * living optional fields (story, displacement, contact).
 */
export function FieldGrantsPanel({
  personId,
  treeId,
  initialGrants,
  candidates,
}: {
  personId: string;
  treeId: string;
  initialGrants: PersonFieldGrantRow[];
  candidates: GrantCandidate[];
}) {
  const { t, dir } = useLocale();
  const [grants, setGrants] = useState(initialGrants);
  const [granteeId, setGranteeId] = useState('');
  const [pending, startTransition] = useTransition();

  const grantedIds = new Set(grants.map((g) => g.grantee_user_id));
  const available = candidates.filter((c) => !grantedIds.has(c.userId));

  function grant() {
    if (!granteeId) {
      toast.error(t('اختر عضوًا أولًا', 'Pick a member first'));
      return;
    }
    startTransition(async () => {
      const result = await grantOptionalFieldsAction({
        personId,
        granteeUserId: granteeId,
        treeId,
      });
      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }
      const picked = candidates.find((c) => c.userId === granteeId);
      setGrants((list) => [
        ...list,
        {
          id: crypto.randomUUID(),
          person_id: personId,
          grantee_user_id: granteeId,
          granted_by: null,
          scope: 'optional_fields',
          created_at: new Date().toISOString(),
          grantee_name: picked?.displayName ?? null,
        },
      ]);
      setGranteeId('');
      toast.success(t('تم منح الصلاحية', 'Grant added'));
    });
  }

  function revoke(grantId: string) {
    startTransition(async () => {
      const result = await revokeOptionalFieldsGrantAction({
        grantId,
        personId,
        treeId,
      });
      if (result?.serverError) {
        toast.error(result.serverError);
        return;
      }
      setGrants((list) => list.filter((g) => g.id !== grantId));
      toast.success(t('تم سحب الصلاحية', 'Grant revoked'));
    });
  }

  return (
    <section
      dir={dir}
      className="rounded-2xl border border-[var(--jt-olive-200)]/70 bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)]"
    >
      <div className="mb-3 flex items-start gap-2">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--jt-olive-700)]" />
        <div>
          <h2
            className="text-base font-bold text-[var(--jt-olive-900)]"
            style={{ fontFamily: 'var(--jt-font-display)' }}
          >
            {t('صلاحيات الحقول الاختيارية', 'Optional field grants')}
          </h2>
          <p className="mt-1 text-sm text-[var(--jt-stone-600)]" style={{ lineHeight: 1.7 }}>
            {t(
              'امنح أعضاء الشجرة صلاحية تحرير القصة والنزوح وبيانات الاتصال لهذا الشخص الحي.',
              'Grant tree members permission to edit story, displacement, and contact fields for this living person.',
            )}
          </p>
        </div>
      </div>

      {grants.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {grants.map((g) => (
            <li
              key={g.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-[var(--jt-olive-50)]/50 px-3 py-2 text-sm"
            >
              <span className="font-medium text-[var(--jt-olive-900)]">
                {g.grantee_name ?? g.grantee_user_id.slice(0, 8)}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => revoke(g.id)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--jt-terra-200)] px-2.5 py-1 text-xs font-semibold text-[var(--jt-terra-700)] hover:bg-[var(--jt-terra-50)] disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                {t('سحب', 'Revoke')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-[var(--jt-stone-500)]">
          {t('لا منح حالياً.', 'No grants yet.')}
        </p>
      )}

      {available.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1 text-sm">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--jt-stone-500)]">
              {t('عضو الشجرة', 'Tree member')}
            </span>
            <select
              value={granteeId}
              onChange={(e) => setGranteeId(e.target.value)}
              className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--jt-olive-400)]"
            >
              <option value="">{t('— اختر —', '— Choose —')}</option>
              {available.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.displayName ?? c.userId.slice(0, 8)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={pending || !granteeId}
            onClick={grant}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--jt-olive-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--jt-olive-800)] disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserPlus className="h-3.5 w-3.5" />
            )}
            {t('منح', 'Grant')}
          </button>
        </div>
      ) : (
        <p className="text-xs text-[var(--jt-stone-500)]">
          {t(
            'أضف متعاونين معتمدين إلى الشجرة أولًا لمنحهم صلاحية.',
            'Add approved collaborators to the tree first, then grant them access.',
          )}
        </p>
      )}
    </section>
  );
}
