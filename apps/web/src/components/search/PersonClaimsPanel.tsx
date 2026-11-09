'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, UserCheck, X } from 'lucide-react';
import { toast } from 'sonner';

import { useLocale } from '@/contexts/LocaleContext';
import {
  respondPersonClaimAction,
  type PersonClaimRequest,
} from '@/data/user/personLink';

/** Tree-owner inbox for pending "is this you?" person claim requests. */
export function PersonClaimsPanel({
  incoming,
}: {
  incoming: PersonClaimRequest[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rows, setRows] = useState(incoming);

  function respond(claimId: string, decision: 'approved' | 'declined') {
    setBusyId(claimId);
    startTransition(async () => {
      const result = await respondPersonClaimAction({ claimId, decision });
      if (result?.serverError) {
        toast.error(result.serverError);
        setBusyId(null);
        return;
      }
      setRows((list) => list.filter((r) => r.id !== claimId));
      toast.success(
        decision === 'approved'
          ? t('تمت الموافقة على طلب الربط', 'Claim approved')
          : t('تم رفض طلب الربط', 'Claim declined'),
      );
      setBusyId(null);
      router.refresh();
    });
  }

  if (rows.length === 0) return null;

  return (
    <section className="mt-10 space-y-4">
      <h2
        className="flex items-center gap-2 text-2xl font-bold text-[var(--jt-olive-900)]"
        style={{ fontFamily: 'var(--jt-font-display)' }}
      >
        <UserCheck className="h-5 w-5 text-[var(--jt-olive-700)]" />
        {t('طلبات ربط الحساب', 'Person claim requests')}
      </h2>
      <ul className="space-y-3">
        {rows.map((r) => {
          const personName =
            locale === 'ar'
              ? r.person_name_ar || r.person_name_en || r.person_id.slice(0, 8)
              : r.person_name_en || r.person_name_ar || r.person_id.slice(0, 8);
          const busy = busyId === r.id || pending;
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--jt-olive-200)] bg-[var(--card)] px-4 py-3"
            >
              <div>
                <p className="font-semibold text-[var(--jt-olive-900)]">{personName}</p>
                <p className="text-xs text-[var(--jt-stone-500)]">
                  {r.requester_name ?? t('عضو', 'Member')}
                  {' · '}
                  {new Date(r.created_at).toLocaleString(locale === 'ar' ? 'ar' : 'en')}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => respond(r.id, 'approved')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--jt-olive-700)] px-3.5 py-1.5 text-xs font-semibold text-[var(--jt-stone-50)] disabled:opacity-50"
                >
                  {busyId === r.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {t('موافقة', 'Approve')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => respond(r.id, 'declined')}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--jt-stone-300)] px-3.5 py-1.5 text-xs font-semibold text-[var(--jt-stone-700)] disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  {t('رفض', 'Decline')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
