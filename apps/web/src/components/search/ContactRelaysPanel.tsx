'use client';

import { Mail } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import type { ContactRelayRow } from '@/data/user/contactRelay';

export function ContactRelaysPanel({
  outgoing,
  incoming,
}: {
  outgoing: ContactRelayRow[];
  incoming: ContactRelayRow[];
}) {
  const { t, locale } = useLocale();
  if (outgoing.length === 0 && incoming.length === 0) return null;

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
          rows={outgoing}
          empty={t('لا طلبات صادرة.', 'No outgoing requests.')}
          locale={locale}
        />
        <RelayList
          title={t('واردة', 'Incoming')}
          rows={incoming}
          empty={t('لا طلبات واردة.', 'No incoming requests.')}
          locale={locale}
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
}: {
  title: string;
  rows: ContactRelayRow[];
  empty: string;
  locale: 'ar' | 'en';
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
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-[var(--jt-stone-100)] px-3 py-2 text-sm text-[var(--jt-stone-700)]"
            >
              <span className="font-semibold capitalize">{r.status}</span>
              <span className="ms-2 text-[var(--jt-stone-400)]">
                {new Date(r.created_at).toLocaleDateString(locale === 'ar' ? 'ar' : 'en')}
              </span>
              {r.message ? <p className="mt-1 text-xs text-[var(--jt-stone-500)]">{r.message}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
