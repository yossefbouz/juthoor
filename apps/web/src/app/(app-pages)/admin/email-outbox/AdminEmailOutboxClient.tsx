'use client';

import { AdminStaffNav } from '@/components/admin/AdminStaffNav';
import { useLocale } from '@/contexts/LocaleContext';
import type { EmailOutboxRow } from '@/data/admin/emailOutbox';

export function AdminEmailOutboxClient({
  initialRows,
}: {
  readonly initialRows: EmailOutboxRow[];
}) {
  const { t, dir } = useLocale();

  return (
    <div dir={dir} className="mx-auto w-full max-w-4xl flex-1 p-4 md:p-8">
      <AdminStaffNav isAdmin />
      <header className="mb-6">
        <h1
          className="text-2xl font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          {t('طابور البريد', 'Email outbox')}
        </h1>
        <p className="mt-1 text-sm text-[var(--jt-stone-600)]" style={{ lineHeight: 1.7 }}>
          {t(
            'كل إشعار داخل التطبيق يُدرج صفًا هنا لإرساله لاحقًا. محليًا يستخدم Auth واجهة Inbucket (:55124). لا تُرسل مفاتيح Resend من المتصفح.',
            'Each in-app notification enqueues a row here for a future worker. Locally, Auth mail uses Inbucket (:55124). Do not put Resend keys in the browser.',
          )}
        </p>
      </header>

      {initialRows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--jt-stone-300)] p-8 text-center text-sm text-[var(--jt-stone-500)]">
          {t('الطابور فارغ.', 'Outbox is empty.')}
        </p>
      ) : (
        <ul className="space-y-3">
          {initialRows.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-4 text-sm shadow-[var(--jt-shadow-sm)]"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-[var(--jt-olive-900)]">{row.subject}</span>
                <span className="rounded-full bg-[var(--jt-stone-100)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--jt-stone-600)]">
                  {row.status}
                </span>
              </div>
              <p className="text-[11px] text-[var(--jt-stone-500)]" dir="ltr">
                {row.kind}
                {row.to_email ? ` · ${row.to_email}` : ''}
                {' · '}
                {new Date(row.created_at).toISOString()}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-[13px] text-[var(--jt-stone-700)]">
                {row.body_text}
              </p>
              {row.error ? (
                <p className="mt-2 text-[11px] text-[var(--jt-terra-600)]">{row.error}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
