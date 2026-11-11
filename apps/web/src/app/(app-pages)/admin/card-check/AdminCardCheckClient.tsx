'use client';

import { useState } from 'react';
import { Check, ExternalLink, FileText, Inbox, Loader2, ShieldCheck, X } from 'lucide-react';
import { AdminStaffNav } from '@/components/admin/AdminStaffNav';
import { useLocale } from '@/contexts/LocaleContext';
import {
  rejectIdentifierCard,
  verifyIdentifierCard,
  type IdentifierCardRequest,
} from '@/data/admin/identifierCards';

function rowKey(r: IdentifierCardRequest) {
  return `${r.personId}:${r.kind}`;
}

export function AdminCardCheckClient({ initialRequests }: { initialRequests: IdentifierCardRequest[] }) {
  const { t, dir, locale } = useLocale();
  const [requests, setRequests] = useState(initialRequests);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(r: IdentifierCardRequest, approve: boolean) {
    setBusyId(rowKey(r));
    setError(null);
    try {
      if (approve) {
        await verifyIdentifierCard({ personId: r.personId, kind: r.kind, attachmentId: r.attachmentId });
      } else {
        await rejectIdentifierCard({ personId: r.personId, kind: r.kind });
      }
      setRequests((rows) => rows.filter((x) => rowKey(x) !== rowKey(r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('فشل الإجراء.', 'Action failed.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div dir={dir} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 md:p-8">
      <AdminStaffNav isAdmin />
      <header>
        <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
          <ShieldCheck className="h-3.5 w-3.5" />
          {t('التحقق من البطاقات', 'Card check')}
        </span>
        <h1 className="text-3xl font-bold text-[var(--jt-olive-900)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
          {t('أرقام البطاقات', 'Card numbers')}
        </h1>
        <p className="mt-1 text-sm text-[var(--jt-stone-600)]">
          {t(
            'افتح نسخة البطاقة (الأونروا أو البطاقة العائلية) وتأكد أن الرقم المُدخل يطابق الرقم الظاهر عليها. لا يربط الرقمُ أحدًا إلا بعد الموافقة.',
            'Open the card copy (UNRWA or family card) and check that the number entered is the number on the card. A number links no one until you approve it.',
          )}
        </p>
        <p className="mt-1 text-xs text-[var(--jt-stone-500)]">
          {t(`${requests.length} قيد المراجعة`, `${requests.length} waiting`)}
        </p>
      </header>

      {error && (
        <div className="rounded-xl bg-[var(--jt-terra-50)] p-3 text-sm text-[var(--jt-terra-700)]">{error}</div>
      )}

      {requests.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/30 p-12 text-center">
          <Inbox className="mx-auto mb-3 h-8 w-8 text-[var(--jt-stone-400)]" />
          <p className="text-sm text-[var(--jt-stone-600)]">{t('لا توجد أرقام قيد المراجعة.', 'Nothing waiting.')}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {requests.map((r) => (
            <li
              key={rowKey(r)}
              className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-[var(--jt-olive-900)]">{r.personName ?? t('شخص', 'Person')}</p>
                  <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--jt-stone-500)]">
                    {r.kind === 'unrwa_registration'
                      ? t('بطاقة الأونروا', 'UNRWA card')
                      : t('البطاقة العائلية 1948', '1948 family card')}
                    {' · '}
                    {r.treeName ?? '—'}
                    {' · '}
                    {new Date(r.uploadedAt).toLocaleDateString(locale === 'ar' ? 'ar' : 'en')}
                  </p>
                  <p className="mt-2 text-sm text-[var(--jt-stone-700)]">
                    {t('الرقم المُدخل:', 'Number entered:')}{' '}
                    <span dir="ltr" className="rounded bg-[var(--jt-stone-50)] px-2 py-0.5 font-mono font-semibold">
                      {r.number}
                    </span>
                  </p>
                </div>
                <div dir="ltr" className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => decide(r, false)}
                    disabled={busyId === rowKey(r)}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--jt-terra-200)] px-3 py-1.5 text-xs font-semibold text-[var(--jt-terra-700)] transition-colors hover:bg-[var(--jt-terra-50)] disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    {t('لا يطابق', 'Does not match')}
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(r, true)}
                    disabled={busyId === rowKey(r)}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--jt-olive-700)] px-3 py-1.5 text-xs font-semibold text-[var(--jt-stone-50)] transition-colors hover:bg-[var(--jt-olive-800)] disabled:opacity-50"
                  >
                    {busyId === rowKey(r) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    {t('يطابق', 'Matches')}
                  </button>
                </div>
              </div>
              <div dir="ltr" className="mt-3">
                {r.copyUrl ? (
                  <a
                    href={r.copyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--jt-olive-200)] bg-[var(--jt-olive-50)]/60 px-3 py-1.5 text-xs font-semibold text-[var(--jt-olive-800)] transition-colors hover:bg-[var(--jt-olive-100)]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t('نسخة البطاقة', 'Card copy')}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--jt-stone-500)]">
                    <FileText className="h-3 w-3" />
                    {t('تعذّر فتح النسخة', 'The copy could not be opened')}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
