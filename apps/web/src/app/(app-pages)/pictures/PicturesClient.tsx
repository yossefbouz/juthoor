'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Image as ImageIcon, Search } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import type { ArchivePicture } from '@/data/user/archives';

export function PicturesClient({ pictures }: { pictures: ArchivePicture[] }) {
  const { t, locale, dir } = useLocale();
  const [nameQ, setNameQ] = useState('');
  const [placeQ, setPlaceQ] = useState('');
  const [dateQ, setDateQ] = useState('');

  const filtered = useMemo(() => {
    const n = nameQ.trim().toLowerCase();
    const p = placeQ.trim().toLowerCase();
    const d = dateQ.trim();
    return pictures.filter((row) => {
      const name =
        (locale === 'ar'
          ? row.person_name_ar || row.person_name_en
          : row.person_name_en || row.person_name_ar) ?? '';
      const place =
        (locale === 'ar'
          ? row.place_name_ar || row.place_name_en
          : row.place_name_en || row.place_name_ar) ?? '';
      if (n && !name.toLowerCase().includes(n)) return false;
      if (p && !place.toLowerCase().includes(p)) return false;
      if (d) {
        const taken = row.date_taken ?? (row.year != null ? String(row.year) : '');
        if (!taken.includes(d)) return false;
      }
      return true;
    });
  }, [pictures, nameQ, placeQ, dateQ, locale]);

  return (
    <div dir={dir} className="relative min-h-full bg-[var(--background)]">
      <div className="relative overflow-hidden border-b border-[var(--jt-olive-200)]/40 bg-gradient-to-b from-[var(--jt-olive-50)] to-transparent">
        <div className="relative mx-auto max-w-5xl px-6 py-10 md:px-10 md:py-14">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--card)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
            <ImageIcon className="h-3 w-3" />
            {t('أرشيف الصور', 'Picture Archive')}
          </p>
          <h1
            className="text-4xl font-bold text-[var(--jt-olive-900)] md:text-5xl"
            style={{ fontFamily: 'var(--jt-font-display)' }}
          >
            {t('ابحث في الصور', 'Search pictures')}
          </h1>
          <p className="mt-2 max-w-2xl text-[var(--jt-stone-600)]">
            {t(
              'ابحث بالاسم أو مكان الالتقاط أو التاريخ.',
              'Search by name, place taken, or date.',
            )}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
        <div className="mb-8 grid gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
              {t('الاسم', 'Name')}
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--jt-stone-400)]" />
              <input
                value={nameQ}
                onChange={(e) => setNameQ(e.target.value)}
                className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] py-2.5 pe-4 ps-10 text-sm outline-none focus:border-[var(--jt-olive-400)]"
                placeholder={t('اسم الفرد', 'Person name')}
              />
            </div>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
              {t('المكان', 'Place')}
            </span>
            <input
              value={placeQ}
              onChange={(e) => setPlaceQ(e.target.value)}
              className="w-full rounded-xl border border-[var(--jt-stone-200)] bg-[var(--background)] px-4 py-2.5 text-sm outline-none focus:border-[var(--jt-olive-400)]"
              placeholder={t('مكان الالتقاط', 'Place taken')}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
              {t('التاريخ', 'Date')}
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
            {t('لا صور مطابقة.', 'No matching pictures.')}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((pic, i) => {
              const name =
                locale === 'ar'
                  ? pic.person_name_ar || pic.person_name_en
                  : pic.person_name_en || pic.person_name_ar;
              const place =
                locale === 'ar'
                  ? pic.place_name_ar || pic.place_name_en
                  : pic.place_name_en || pic.place_name_ar;
              return (
                <motion.li
                  key={pic.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link
                    href={`/tree/${pic.tree_id}/person/${pic.person_id}`}
                    className="group block overflow-hidden rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] shadow-[var(--jt-shadow-sm)] transition hover:-translate-y-0.5 hover:border-[var(--jt-olive-300)]"
                  >
                    <div className="aspect-[4/3] bg-[var(--jt-stone-100)]">
                      {pic.signed_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={pic.signed_url}
                          alt={name ?? ''}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[var(--jt-stone-400)]">
                          <ImageIcon className="h-8 w-8" />
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="truncate font-semibold text-[var(--jt-olive-900)]">{name}</p>
                      <p className="truncate text-xs text-[var(--jt-stone-500)]">
                        {[place, pic.date_taken ?? (pic.year != null ? String(pic.year) : null)]
                          .filter(Boolean)
                          .join(' · ') || t('بدون تفاصيل', 'No details')}
                      </p>
                    </div>
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
