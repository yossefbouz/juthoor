'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { Check, X, FileText, Users, ArrowLeft, ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { approveAccessRequest, rejectAccessRequest, type AccessRequest } from '@/data/user/access';
import type { ContactRelayRow } from '@/data/user/contactRelay';
import { ContactRelaysPanel } from '@/components/search/ContactRelaysPanel';

export function RequestsClient({
  initialRequests,
  contactOutgoing = [],
  contactIncoming = [],
}: {
  initialRequests: AccessRequest[];
  contactOutgoing?: ContactRelayRow[];
  contactIncoming?: ContactRelayRow[];
}) {
  const { t, locale, dir } = useLocale();
  const router = useRouter();
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const [requests, setRequests] = useState<AccessRequest[]>(initialRequests);
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function remove(id: string) {
    setRequests((rs) => rs.filter((r) => r.id !== id));
  }

  async function onApprove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await approveAccessRequest(id);
      startTransition(() => {
        remove(id);
        // Refresh server components — sidebar reads pendingRequestsCount on the
        // server so the gold "1" badge needs a re-render to disappear.
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(id: string) {
    setBusyId(id);
    setError(null);
    const reason = window.prompt(t('سبب الرفض (اختياري)', 'Reason for rejection (optional)')) ?? null;
    try {
      await rejectAccessRequest(id, reason);
      startTransition(() => {
        remove(id);
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div dir={dir} className="relative min-h-full bg-[var(--background)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[300px] bg-[radial-gradient(ellipse_at_top,_var(--jt-olive-100)_0%,_transparent_65%)] opacity-60" />
      </div>

      <div className="mx-auto max-w-4xl px-6 py-10 md:py-14">
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-[var(--jt-stone-500)] hover:text-[var(--jt-olive-700)]">
            <Arrow className="h-3 w-3 rtl:rotate-180" />
            {t('العودة إلى لوحة الجذور', 'Back to dashboard')}
          </Link>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
            <Sparkles className="h-3 w-3" />
            {t('طلبات الوصول', 'Access requests')}
          </p>
          <h1 className="text-4xl font-bold text-[var(--jt-olive-900)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
            {t('من يطلب الانضمام لشجرتك', 'Who wants to join your tree')}
          </h1>
          <p className="mt-2 text-[var(--jt-stone-600)]">
            {t(
              'راجع المستند المُرفق قبل الموافقة. لن يصل أحد إلى بيانات عائلتك دون إذنك.',
              'Review the attached document before approving. No one accesses your family data without your permission.',
            )}
          </p>
        </motion.header>

        {error && (
          <div className="mb-5 rounded-2xl border border-[var(--jt-terra-200)] bg-[var(--jt-terra-50)]/60 p-4 text-sm text-[var(--jt-terra-700)]">
            {error}
          </div>
        )}

        {requests.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="rounded-3xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/40 p-10 text-center"
          >
            <h3 className="text-xl font-bold text-[var(--jt-olive-900)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
              {t('لا طلبات حاليًا', 'No pending requests')}
            </h3>
            <p className="mx-auto mt-3 max-w-md text-sm text-[var(--jt-stone-600)]">
              {t(
                'سيصل هنا أيّ شخص يطلب الوصول إلى إحدى شجراتك. ستراجع مستنداته وتقرّر.',
                'Anyone requesting access to your trees will show up here. You\'ll review their proof and decide.',
              )}
            </p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {requests.map((r, i) => (
              <motion.article
                key={r.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-6 shadow-[var(--jt-shadow-sm)]"
              >
                {/* Header */}
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]" suppressHydrationWarning>
                    {/* `toLocaleString` differs slightly between Node and the browser (e.g. ar comma).
                        suppressHydrationWarning is fine here — value is pure-formatting display. */}
                    {new Date(r.requested_at).toLocaleString(locale === 'ar' ? 'ar' : 'en')}
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-[var(--jt-olive-900)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
                    {r.requester_display_name ?? t('عضو مجهول', 'Unknown user')}
                  </h3>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--jt-stone-600)]">
                    <Users className="h-3.5 w-3.5" />
                    {t('يطلب الوصول إلى', 'wants access to')}{' '}
                    <span className="font-semibold text-[var(--jt-stone-800)]">{r.tree_name}</span>
                    <span className="rounded-full bg-[var(--jt-olive-100)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--jt-olive-700)]">
                      {r.requested_role === 'collaborator' ? t('مشارك', 'Collaborator') : t('قراءة', 'Read')}
                    </span>
                  </p>
                </div>

                {r.requester_note && (
                  <p
                    className="mb-3 rounded-2xl bg-[var(--jt-stone-50)]/70 p-4 text-sm italic text-[var(--jt-stone-700)]"
                    style={{ fontFamily: isArLocale(locale) ? 'var(--jt-font-arabic)' : 'var(--jt-font-latin)', lineHeight: isArLocale(locale) ? 1.9 : 1.6 }}
                  >
                    « {r.requester_note} »
                  </p>
                )}

                {/* Footer: proof link on its own row, big action buttons on a row below.
                    No RTL flex weirdness — just two stacked rows that always show
                    everything regardless of viewport width or sidebar state. */}
                <div className="mt-4 flex flex-col gap-3 border-t border-[var(--jt-stone-200)]/60 pt-4">
                  {r.proof_signed_url ? (
                    <a
                      href={r.proof_signed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-fit items-center gap-2 rounded-xl border border-[var(--jt-olive-200)] bg-[var(--jt-olive-50)]/60 px-4 py-2.5 text-xs font-semibold text-[var(--jt-olive-800)] transition-colors hover:bg-[var(--jt-olive-100)]"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {t('عرض المستند', 'View proof document')}
                    </a>
                  ) : (
                    <p className="text-xs text-[var(--jt-stone-500)]">{t('لا مستند مرفق', 'No document attached')}</p>
                  )}

                  {/* Force LTR on this row so the flex/grid layout always behaves
                      predictably regardless of the page direction. The button
                      LABELS are still in the user's locale; only the layout flow
                      is forced. Reject sits on the left, Approve (primary) on
                      the right — the consistent destructive-then-confirm pattern. */}
                  <div dir="ltr" className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onReject(r.id)}
                      disabled={isPending || busyId === r.id}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--jt-stone-200)] bg-[var(--background)] px-5 py-2.5 text-xs font-semibold text-[var(--jt-stone-700)] transition-colors hover:border-[var(--jt-terra-400)] hover:text-[var(--jt-terra-700)] disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                      {t('رفض', 'Reject')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onApprove(r.id)}
                      disabled={isPending || busyId === r.id}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[var(--jt-olive-700)] px-5 py-2.5 text-xs font-semibold text-[var(--jt-stone-50)] transition-colors hover:bg-[var(--jt-olive-800)] disabled:opacity-50"
                    >
                      {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {t('موافقة', 'Approve')}
                    </button>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        )}
      </div>

        <ContactRelaysPanel outgoing={contactOutgoing} incoming={contactIncoming} />
    </div>
  );
}

function isArLocale(l: 'ar' | 'en'): boolean { return l === 'ar'; }
