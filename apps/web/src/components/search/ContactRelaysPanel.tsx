'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Mail, MessageSquare, X } from 'lucide-react';
import { toast } from 'sonner';

import { useLocale } from '@/contexts/LocaleContext';
import {
  respondContactRelayAction,
  type ContactRelayRow,
} from '@/data/user/contactRelay';

export function ContactRelaysPanel({
  outgoing,
  incoming,
}: {
  outgoing: ContactRelayRow[];
  incoming: ContactRelayRow[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outRows, setOutRows] = useState(outgoing);
  const [inRows, setInRows] = useState(incoming);

  function respond(row: ContactRelayRow, status: 'accepted' | 'declined' | 'revoked') {
    setBusyId(row.id);
    startTransition(async () => {
      try {
        const result = await respondContactRelayAction({ relayId: row.id, status });
        const updated = result.relay;
        setInRows((list) => list.map((r) => (r.id === updated.id ? updated : r)));
        setOutRows((list) => list.map((r) => (r.id === updated.id ? updated : r)));
        if (status === 'accepted') {
          toast.success(t('تم قبول الطلب', 'Request accepted'));
          if (result.threadId) {
            router.push(`/messages/${result.threadId}`);
            return;
          }
        } else if (status === 'declined') {
          toast.success(t('تم رفض الطلب', 'Request declined'));
        } else {
          toast.success(t('تم سحب الطلب', 'Request revoked'));
        }
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('فشل التحديث', 'Update failed'));
      } finally {
        setBusyId(null);
      }
    });
  }

  if (outRows.length === 0 && inRows.length === 0) return null;

  return (
    <section className="mt-10 space-y-4">
      <h2
        className="text-2xl font-bold text-[var(--jt-olive-900)]"
        style={{ fontFamily: 'var(--jt-font-display)' }}
      >
        {t('طلبات التواصل', 'Contact requests')}
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <RelayList
          title={t('صادرة', 'Outgoing')}
          rows={outRows}
          empty={t('لا طلبات صادرة.', 'No outgoing requests.')}
          locale={locale}
          mode="outgoing"
          busyId={busyId}
          pending={pending}
          onRespond={respond}
          t={t}
        />
        <RelayList
          title={t('واردة', 'Incoming')}
          rows={inRows}
          empty={t('لا طلبات واردة.', 'No incoming requests.')}
          locale={locale}
          mode="incoming"
          busyId={busyId}
          pending={pending}
          onRespond={respond}
          t={t}
        />
      </div>
    </section>
  );
}

function RelayList({
  title,
  rows,
  empty,
  locale,
  mode,
  busyId,
  pending,
  onRespond,
  t,
}: {
  title: string;
  rows: ContactRelayRow[];
  empty: string;
  locale: 'ar' | 'en';
  mode: 'incoming' | 'outgoing';
  busyId: string | null;
  pending: boolean;
  onRespond: (row: ContactRelayRow, status: 'accepted' | 'declined' | 'revoked') => void;
  t: (ar: string, en: string) => string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-4">
      <p className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--jt-olive-700)]">
        <Mail className="h-3.5 w-3.5" />
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--jt-stone-500)]">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const isBusy = busyId === r.id && pending;
            const canRespondIncoming = mode === 'incoming' && r.status === 'pending' && !r.revoked_at;
            const canRevokeOutgoing = mode === 'outgoing' && r.status === 'pending' && !r.revoked_at;
            return (
              <li
                key={r.id}
                className="rounded-xl border border-[var(--jt-stone-100)] px-3 py-2 text-sm text-[var(--jt-stone-700)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold capitalize">{r.status}</span>
                    <span className="ms-2 text-[var(--jt-stone-400)]">
                      {new Date(r.created_at).toLocaleDateString(locale === 'ar' ? 'ar' : 'en')}
                    </span>
                  </div>
                  {canRespondIncoming ? (
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onRespond(r, 'accepted')}
                        className="inline-flex items-center gap-1 rounded-full bg-[var(--jt-olive-700)] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        {t('قبول', 'Accept')}
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => onRespond(r, 'declined')}
                        className="inline-flex items-center gap-1 rounded-full border border-[var(--jt-terra-200)] px-2.5 py-1 text-[11px] font-semibold text-[var(--jt-terra-700)] disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        {t('رفض', 'Decline')}
                      </button>
                    </div>
                  ) : null}
                  {canRevokeOutgoing ? (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onRespond(r, 'revoked')}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--jt-stone-200)] px-2.5 py-1 text-[11px] font-semibold text-[var(--jt-stone-600)] disabled:opacity-50"
                    >
                      {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                      {t('سحب', 'Revoke')}
                    </button>
                  ) : null}
                  {r.status === 'accepted' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--jt-olive-700)]">
                      <MessageSquare className="h-3 w-3" />
                      {t('مقبول', 'Accepted')}
                    </span>
                  ) : null}
                </div>
                {r.message ? <p className="mt-1 text-xs text-[var(--jt-stone-500)]">{r.message}</p> : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
