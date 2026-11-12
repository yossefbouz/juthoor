'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FileText, Search } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import type { ArchiveDocument } from '@/data/user/archives';

export function DocumentsClient({ documents }: { documents: ArchiveDocument[] }) {
  const { t, locale, dir } = useLocale();
  const [titleQ, setTitleQ] = useState('');
  const [authorityQ, setAuthorityQ] = useState('');
  const [dateQ, setDateQ] = useState('');

  const filtered = useMemo(() => {
    const title = titleQ.trim().toLowerCase();
    const auth = authorityQ.trim().toLowerCase();
    const d = dateQ.trim();
    return documents.filter((row) => {
      if (title && !(row.title ?? '').toLowerCase().includes(title)) return false;
      if (auth && !(row.issuing_authority ?? '').toLowerCase().includes(auth)) return false;
      if (d) {
        const issued = row.issue_date ?? (row.year != null ? String(row.year) : '');
        if (!issued.includes(d)) return false;
      }
      return true;
    });
  }, [documents, titleQ, authorityQ, dateQ]);

  return (
    <div dir={dir} className="relative min-h-full bg-[var(--background)]">
      <div className="relative overflow-hidden border-b border-[var(--jt-olive-200)]/40 bg-gradient-to-b from-[var(--jt-olive-50)] to-transparent">
        <div className="relative mx-auto max-w-5xl px-6 py-10 md:px-10 md:py-14">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--card)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
            <FileText className="h-3 w-3" />
            {t('أرشيف الوثائق', 'Document Archive')}
          </p>
          <h1
            className="text-4xl font-bold text-[var(--jt-olive-900)] md:text-5xl"
            style={{ fontFamily: 'var(--jt-font-display)' }}
          >
            {t('ابحث في الوثائق', 'Search documents')}
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--jt-stone-600)]">
            {t(
              'ابحث بالعنوان أو الجهة المُصدِرة أو تاريخ الإصدار.',
              'Search by title, issuing authority, or issue date.',
            )}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
        <div className="mb-8 grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
              {t('العنوان', 'Title')}
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--jt-stone-400)]" />
              <input
                value={titleQ}
                onChange={(e) => setTitleQ(e.target.value)}
                className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] py-2.5 pe-4 ps-10 text-sm outline-none focus:border-[var(--jt-olive-400)]"
                placeholder={t('عنوان الوثيقة', 'Document title')}
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
              {t('الجهة المُصدِرة', 'Authority')}
            </span>
            <input
              value={authorityQ}
              onChange={(e) => setAuthorityQ(e.target.value)}
              className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)]"
              placeholder={t('مثلاً: الأونروا', 'e.g. UNRWA')}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
              {t('تاريخ الإصدار', 'Issue date')}
            </span>
            <input
              value={dateQ}
              onChange={(e) => setDateQ(e.target.value)}
              className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)]"
              placeholder="1982 / 1982-05-01"
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/40 p-10 text-center text-sm text-[var(--jt-stone-600)]">
            {t('لا وثائق مطابقة.', 'No matching documents.')}
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((doc, i) => {
              const person =
                locale === 'ar'
                  ? doc.person_name_ar || doc.person_name_en
                  : doc.person_name_en || doc.person_name_ar;
              return (
                <motion.li
                  key={doc.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3) }}
                  className="rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-4 shadow-[var(--jt-shadow-sm)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--jt-olive-900)]">
                        {doc.title || t('بدون عنوان', 'Untitled')}
                      </p>
                      <p className="mt-1 text-xs text-[var(--jt-stone-500)]">
                        {[doc.issuing_authority, doc.issue_date ?? (doc.year != null ? String(doc.year) : null)]
                          .filter(Boolean)
                          .join(' · ') || t('بدون تفاصيل إصدار', 'No issue details')}
                      </p>
                      {person && (
                        <p className="mt-1 text-xs text-[var(--jt-stone-600)]">
                          {t('مرتبط بـ', 'Linked to')}{' '}
                          <Link
                            href={`/tree/${doc.tree_id}/person/${doc.person_id}`}
                            className="font-semibold text-[var(--jt-olive-700)] hover:underline"
                          >
                            {person}
                          </Link>
                        </p>
                      )}
                    </div>
                    {doc.signed_url && (
                      <a
                        href={doc.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--jt-olive-700)] px-4 py-2 text-xs font-semibold text-[var(--jt-stone-50)] hover:bg-[var(--jt-olive-800)]"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {t('فتح', 'Open')}
                      </a>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
