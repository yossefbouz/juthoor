'use client';

import { useState } from 'react';
import {
  Check,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { AdminStaffNav } from '@/components/admin/AdminStaffNav';
import { useLocale } from '@/contexts/LocaleContext';
import { logAccessAction } from '@/data/user/accessLog';
import {
  reviewVerification,
  type IdDocumentType,
  type PendingVerification,
} from '@/data/user/identityVerification';

const ID_TYPE_LABEL: Record<IdDocumentType, { ar: string; en: string }> = {
  passport: { ar: 'جواز سفر', en: 'Passport' },
  national_id: { ar: 'بطاقة هوية وطنية', en: 'National ID' },
  refugee_card: { ar: 'بطاقة لاجئ', en: 'Refugee card' },
  other: { ar: 'وثيقة أخرى', en: 'Other' },
};

export function AdminVerificationsClient({
  initialPending,
  isAdmin = true,
}: {
  initialPending: PendingVerification[];
  isAdmin?: boolean;
}) {
  const { t, dir, locale } = useLocale();
  const [pending, setPending] = useState(initialPending);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function review(id: string, approve: boolean) {
    setBusyId(id);
    setError(null);
    try {
      await reviewVerification({ id, approve });
      setPending((rows) => rows.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('فشل الإجراء.', 'Action failed.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div dir={dir} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 md:p-8">
      <AdminStaffNav isAdmin={isAdmin} />
      <header>
        <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('مراجعة التوثيق', 'Verification review')}
        </span>
        <h1 className="text-3xl font-bold text-[var(--jt-olive-900)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
          {t('طلبات توثيق الهوية', 'Identity verification requests')}
        </h1>
        <p className="mt-1 text-sm text-[var(--jt-stone-600)]">
          {t(`${pending.length} طلب قيد المراجعة`, `${pending.length} request(s) pending`)}
        </p>
      </header>

      {error && (
        <div className="rounded-xl bg-[var(--jt-terra-50)] p-3 text-sm text-[var(--jt-terra-700)]">
          {error}
        </div>
      )}

      {pending.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/30 p-12 text-center">
          <Inbox className="mx-auto mb-3 h-8 w-8 text-[var(--jt-stone-400)]" />
          <p className="text-sm text-[var(--jt-stone-600)]">
            {t('لا توجد طلبات قيد المراجعة.', 'No pending requests.')}
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {pending.map((v) => (
            <li
              key={v.id}
              className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-[var(--jt-olive-900)]">
                    {v.submitter_name ?? t('مستخدم', 'User')}
                  </p>
                  <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--jt-stone-500)]">
                    {locale === 'ar' ? ID_TYPE_LABEL[v.id_document_type].ar : ID_TYPE_LABEL[v.id_document_type].en}
                    {' · '}
                    {new Date(v.created_at).toLocaleDateString(locale === 'ar' ? 'ar' : 'en')}
                  </p>
                  {v.tree_name && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[var(--jt-olive-50)] px-2 py-0.5 text-[11px] font-medium text-[var(--jt-olive-700)]">
                      {t('سيُمنح تحرير:', 'Grants edit on:')} {v.tree_name}
                    </p>
                  )}
                </div>
                {isAdmin ? (
                  <div dir="ltr" className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => review(v.id, false)}
                      disabled={busyId === v.id}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--jt-terra-200)] px-3 py-1.5 text-xs font-semibold text-[var(--jt-terra-700)] transition-colors hover:bg-[var(--jt-terra-50)] disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t('رفض', 'Reject')}
                    </button>
                    <button
                      type="button"
                      onClick={() => review(v.id, true)}
                      disabled={busyId === v.id}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--jt-olive-700)] px-3 py-1.5 text-xs font-semibold text-[var(--jt-stone-50)] transition-colors hover:bg-[var(--jt-olive-800)] disabled:opacity-50"
                    >
                      {busyId === v.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )}
                      {t('موافقة', 'Approve')}
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--jt-stone-500)]">
                    {t('القراءة فقط للمشرف', 'Read-only for moderators')}
                  </p>
                )}
              </div>

              <div dir="ltr" className="mt-3 flex flex-wrap gap-2">
                {v.id_document_url && (
                  <a
                    href={v.id_document_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      void logAccessAction({
                        resourceType: 'verification_doc',
                        resourceId: v.id,
                        action: 'open',
                      });
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--jt-olive-200)] bg-[var(--jt-olive-50)]/60 px-3 py-1.5 text-xs font-semibold text-[var(--jt-olive-800)] transition-colors hover:bg-[var(--jt-olive-100)]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t('وثيقة الهوية', 'ID document')}
                  </a>
                )}
                {v.family_evidence_url && (
                  <a
                    href={v.family_evidence_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      void logAccessAction({
                        resourceType: 'verification_doc',
                        resourceId: `${v.id}:family`,
                        action: 'open',
                      });
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--jt-gold-300)]/50 bg-[var(--jt-gold-100)]/50 px-3 py-1.5 text-xs font-semibold text-[var(--jt-stone-700)] transition-colors hover:opacity-80"
                  >
                    <FileText className="h-3 w-3" />
                    {t('دليل العائلة', 'Family evidence')}
                  </a>
                )}
              </div>

              {v.family_evidence_note && (
                <p className="mt-3 rounded-xl bg-[var(--jt-stone-50)] p-3 text-sm text-[var(--jt-stone-700)]" style={{ lineHeight: 1.7 }}>
                  {v.family_evidence_note}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
