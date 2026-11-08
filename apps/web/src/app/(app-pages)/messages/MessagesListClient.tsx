'use client';

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import type { MessageThreadSummary } from '@/data/user/messages';

const CONTEXT_LABEL: Record<string, { ar: string; en: string }> = {
  relationship_dispute: { ar: 'نزاع علاقة', en: 'Relationship dispute' },
  picture_link: { ar: 'ربط صورة', en: 'Picture link' },
  document_link: { ar: 'ربط وثيقة', en: 'Document link' },
  contact_relay: { ar: 'تواصل', en: 'Contact relay' },
};

export function MessagesListClient({ threads }: { threads: MessageThreadSummary[] }) {
  const { t, dir } = useLocale();

  return (
    <div dir={dir} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-4 md:p-8">
      <header>
        <span className="mb-2 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
          <MessageSquare className="h-3.5 w-3.5" />
          {t('الرسائل', 'Messages')}
        </span>
        <h1
          className="text-3xl font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('محادثاتك', 'Your threads')}
        </h1>
        <p className="mt-1 text-sm text-[var(--jt-stone-600)]">
          {t(
            'محادثات النزاعات وربط الوسائط وطلبات التواصل.',
            'Threads from disputes, media links, and contact requests.',
          )}
        </p>
      </header>

      {threads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--jt-stone-200)] bg-[var(--jt-stone-50)]/60 px-6 py-16 text-center text-sm text-[var(--jt-stone-600)]">
          {t('لا محادثات بعد.', 'No threads yet.')}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {threads.map((th) => {
            const label = CONTEXT_LABEL[th.contextType] ?? {
              ar: th.contextType,
              en: th.contextType,
            };
            return (
              <li key={th.id}>
                <Link
                  href={`/messages/${th.id}`}
                  className="block rounded-2xl border border-[var(--jt-olive-200)]/60 bg-white/90 p-4 shadow-sm transition hover:border-[var(--jt-olive-400)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-[var(--jt-olive-900)]">
                      {th.counterpartName || t('مشارك', 'Participant')}
                    </p>
                    <span className="rounded-full bg-[var(--jt-olive-50)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--jt-olive-700)]">
                      {t(label.ar, label.en)}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-[var(--jt-stone-600)]">
                    {th.lastBody || t('بدون رسائل بعد', 'No messages yet')}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
