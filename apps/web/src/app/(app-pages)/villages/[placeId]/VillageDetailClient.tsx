'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Files,
  Image as ImageIcon,
  Landmark,
  Lock,
  MapPin,
  Network,
  Plus,
  Tent,
  TreePine,
  Users,
} from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import type {
  PlaceDetail,
  PlaceMedia,
  PlacePerson,
  PlaceProfile,
  SurnameGroupItem,
} from '@/data/user/places';

function looksArabic(s: string | null): boolean {
  if (!s) return false;
  return /[؀-ۿ]/.test(s);
}

/** "32.4°N, 34.9°E" — null when coordinates are missing. */
function formatCoords(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns}, ${Math.abs(lng).toFixed(1)}°${ew}`;
}

const TYPE_META: Record<
  string,
  { ar: string; en: string; icon: React.ComponentType<{ className?: string }> }
> = {
  village: { ar: 'قرية', en: 'Village', icon: MapPin },
  city: { ar: 'مدينة', en: 'City', icon: Users },
  clan_locality: { ar: 'عشيرة', en: 'Clan', icon: Tent },
  khirba: { ar: 'خربة', en: 'Ruin', icon: MapPin },
};

export function VillageDetailClient({
  place,
  persons,
  surnames,
  profile,
  media,
}: {
  place: PlaceDetail;
  persons: PlacePerson[];
  surnames: SurnameGroupItem[];
  profile?: PlaceProfile | null;
  media?: PlaceMedia;
}) {
  const { t, locale, dir } = useLocale();
  const gallery = media?.gallery ?? [];
  const documents = media?.documents ?? [];
  const isAR = locale === 'ar';
  const Arrow = isAR ? ArrowLeft : ArrowRight;
  const Sep = isAR ? ChevronLeft : ChevronRight;

  const pick = (ar: string | null | undefined, en: string | null | undefined) =>
    (isAR ? ar || en : en || ar) || null;

  const historyText = pick(profile?.historical_overview_ar, profile?.historical_overview_en);
  const remainsText = pick(profile?.what_remains_ar, profile?.what_remains_en);
  const sourceText = pick(profile?.source_attribution_ar, profile?.source_attribution_en);
  const externalLinks = profile?.external_links ?? [];
  const isDepopulated = Boolean(place.is_depopulated || place.depopulated_year);

  const meta = TYPE_META[place.place_type ?? 'village'] ?? TYPE_META.village;
  const TypeIcon = meta.icon;

  const isArabicName = looksArabic(place.name_ar);
  const heroAr = isArabicName ? place.name_ar : place.name_en ?? place.name_ar;
  const heroEn = isArabicName ? place.name_en : null;

  const district = pick(place.district_ar, place.district_en);
  const coords = formatCoords(place.latitude, place.longitude);

  return (
    <div dir={dir} className="relative min-h-full bg-[var(--background)]">
      <div className="mx-auto max-w-3xl px-5 py-6 md:py-8">
        {/* ── Breadcrumb ── */}
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--jt-stone-500)]">
          <Link href="/villages" className="font-medium text-[var(--jt-olive-700)] hover:underline">
            {t('القرى والمدن والعشائر', 'Villages, Cities & Clans')}
          </Link>
          {district && (
            <>
              <Sep className="h-3.5 w-3.5 opacity-60" />
              <span>{t(`منطقة: ${district}`, `District: ${district}`)}</span>
            </>
          )}
          <Sep className="h-3.5 w-3.5 opacity-60" />
          <span className="font-semibold text-[var(--jt-olive-800)]">{heroAr}</span>
        </nav>

        {/* ── Hero band (solid olive) ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-2xl bg-[var(--jt-olive-700)] p-6 md:p-7"
        >
          {isDepopulated && (
            <span className="absolute end-4 top-4 rounded-full bg-[var(--jt-terra-500)] px-3 py-1 text-[10px] font-semibold text-white">
              {place.depopulated_year
                ? t(`هُجّرت ${place.depopulated_year}`, `Depopulated ${place.depopulated_year}`)
                : t('قرية مهجّرة', 'Depopulated 1948')}
            </span>
          )}
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/75">
            <TypeIcon className="h-3 w-3" />
            {t(meta.ar, meta.en)}
          </span>
          <h1
            className="text-3xl font-bold leading-tight text-white md:text-4xl"
            style={{ fontFamily: isArabicName ? 'var(--jt-font-display)' : 'var(--jt-font-latin)' }}
          >
            {heroAr}
          </h1>
          {heroEn && <p className="mt-1 text-base text-white/75" dir="ltr">{heroEn}</p>}

          {/* meta row: District / Coordinates / Year depopulated */}
          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 border-t border-white/15 pt-4">
            {district && <HeroMeta value={district} label={t('المنطقة', 'District')} />}
            {coords && <HeroMeta value={coords} label={t('الموقع', 'Coordinates')} ltr />}
            {place.depopulated_year && (
              <HeroMeta value={String(place.depopulated_year)} label={t('سنة التهجير', 'Year depopulated')} ltr />
            )}
          </div>
        </motion.div>

        {/* ── Stat grid ── */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Stat
            value={profile?.population_count ?? null}
            label={
              profile?.population_year
                ? t(`السكان (${profile.population_year})`, `Population (${profile.population_year})`)
                : t('السكان', 'Population')
            }
          />
          <Stat value={persons.length} label={t('الذرية الموثقة', 'Documented descendants')} />
          <Stat value={surnames.length} label={t('العائلات', 'Family names')} />
        </div>

        {/* ── Historical overview + What remains ── */}
        {historyText && (
          <InfoCard
            icon={BookOpen}
            title={t('نظرة تاريخية', 'Historical overview')}
            body={historyText}
            source={sourceText}
          />
        )}
        {remainsText && (
          <InfoCard
            icon={Landmark}
            title={t('ما تبقى اليوم', 'What remains today')}
            body={remainsText}
          />
        )}

        {/* ── Divider ── */}
        <div className="my-6 flex items-center gap-2">
          <span className="h-px flex-1 bg-[var(--jt-stone-200)]" />
          <span className="h-1.5 w-1.5 rotate-45 bg-[var(--jt-olive-500)]" />
          <span className="h-px flex-1 bg-[var(--jt-stone-200)]" />
        </div>

        {/* ── Next actions ── */}
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--jt-stone-500)]">
          {t('الإجراءات التالية', 'Next actions')}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ActionButton
            icon={Network}
            title={t('عرض العائلات من هنا', 'View families from here')}
            sub={t('تصفّح أشجار العائلات الموثقة المرتبطة بهذا المكان', 'Browse documented family trees linked here')}
            href="#families"
          />
          <ActionButton
            icon={ImageIcon}
            title={t('معرض الصور', 'View photo gallery')}
            sub={t('صور تاريخية وصور مساهمة من العائلات', 'Historical and family-contributed images')}
            href="#gallery"
          />
          <ActionButton
            icon={Files}
            title={t('أرشيف الوثائق', 'View document archive')}
            sub={t('سجلات الأرض والشهادات والوثائق', 'Land records, testimonies, documents')}
            href="#archive"
          />
          <ActionButton
            icon={ExternalLink}
            title={t('مصادر خارجية إضافية', 'More external resources')}
            sub={t('روابط إلى iReturn وPalestine Remembered وغيرها', 'Links to iReturn, Palestine Remembered & more')}
            href="#resources"
          />
        </div>

        {/* ── Families from here (real data) ── */}
        <section id="families" className="mt-10 scroll-mt-6">
          <SectionHead
            kicker={t('عائلات', 'Families')}
            title={t('من هذا المكان', 'From this place')}
            note={t(`${surnames.length} لقبًا`, `${surnames.length} surnames`)}
          />
          {surnames.length === 0 ? (
            <EmptyHint
              ar="لم يُسجَّل أحدٌ من هذا المكان بعد. كن أول من يربط جذوره به."
              en="No families recorded yet. Be the first to link your roots here."
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {surnames.map((s) => {
                const label = s.surname_ar ?? s.surname_en ?? '';
                if (!label) return null;
                const isAr = looksArabic(label);
                return (
                  <Link
                    key={label}
                    href={`/families/${encodeURIComponent(label)}`}
                    className="group inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--card)] px-4 py-2 text-sm transition-all hover:-translate-y-0.5 hover:border-[var(--jt-olive-500)] hover:shadow-[var(--jt-shadow-sm)]"
                  >
                    <span
                      className="font-semibold text-[var(--jt-olive-900)]"
                      style={{ fontFamily: isAr ? 'var(--jt-font-display)' : 'var(--jt-font-latin)' }}
                    >
                      {label}
                    </span>
                    <span className="rounded-full bg-[var(--jt-olive-50)] px-2 text-[10px] font-bold text-[var(--jt-olive-700)]">
                      {s.count}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* ── People from here (real data) ── */}
        <section className="mt-10">
          <SectionHead kicker={t('أفراد', 'People')} title={t('سُجِّلوا في هذا المكان', 'Recorded here')} />
          {persons.length === 0 ? (
            <EmptyHint ar="لم يُربط أي شخصٍ بهذا المكان بعد." en="No person has been linked to this place yet." />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {persons.map((p, i) => {
                if (p.protected) {
                  return (
                    <motion.li
                      key={p.person_id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.4) }}
                    >
                      <div className="flex items-center gap-3 rounded-2xl border border-dashed border-[var(--jt-stone-200)] bg-[var(--jt-stone-50)]/60 p-3 text-sm">
                        <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--jt-stone-100)] text-[var(--jt-stone-400)]">
                          <Lock className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--jt-stone-500)]">{t('فرد محمي', 'Protected record')}</p>
                          <p className="truncate text-[11px] text-[var(--jt-stone-400)]">{t('على قيد الحياة — محمي بموجب الخصوصية', 'Living person — withheld for privacy')}</p>
                        </div>
                      </div>
                    </motion.li>
                  );
                }
                const name = isAR
                  ? p.display_name_ar || p.display_name_en
                  : p.display_name_en || p.display_name_ar;
                const initial = (name ?? '·').slice(0, 1);
                return (
                  <motion.li
                    key={p.person_id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.02, 0.4) }}
                  >
                    <Link
                      href={`/tree/${p.tree_id}/person/${p.person_id}`}
                      className="group flex items-center gap-3 rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-3 text-sm shadow-[var(--jt-shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[var(--jt-olive-400)]"
                    >
                      <span
                        className={
                          'inline-flex h-9 w-9 flex-none items-center justify-center rounded-full font-bold '
                          + (p.gender === 'F'
                            ? 'bg-[var(--jt-terra-50)] text-[var(--jt-terra-600)]'
                            : 'bg-[var(--jt-olive-100)] text-[var(--jt-olive-800)]')
                        }
                        style={{ fontFamily: 'var(--jt-font-display)' }}
                      >
                        {initial}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-[var(--jt-stone-900)]">{name}</p>
                        <p className="truncate text-[11px] text-[var(--jt-stone-500)]">
                          {p.birth_year ? `${p.birth_year} · ` : ''}
                          {p.tree_name ?? t('شجرة', 'Tree')}
                        </p>
                      </div>
                      <Arrow className="h-3.5 w-3.5 flex-none text-[var(--jt-stone-400)] transition-colors group-hover:text-[var(--jt-olive-600)]" />
                    </Link>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── Photo gallery (flow 7.0) ── */}
        <section id="gallery" className="mt-10 scroll-mt-6">
          <SectionHead
            kicker={t('صور', 'Photos')}
            title={t('معرض الصور', 'Photo gallery')}
            note={gallery.length ? t(`${gallery.length} صورة`, `${gallery.length} photos`) : undefined}
          />
          {gallery.length === 0 ? (
            <EmptyHint
              ar="ستظهر الصور التاريخية وصور العائلات هنا مع مساهمات الأهالي."
              en="Historical and family photos will appear here as families contribute."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {gallery.map((g, i) => {
                const cap = pick(g.caption_ar, g.caption_en);
                return (
                  <a
                    key={`${g.url}-${i}`}
                    href={g.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative block aspect-square overflow-hidden rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--jt-stone-100)]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={g.url}
                      alt={cap ?? ''}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                    {(cap || g.year) && (
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent p-2 text-[11px] text-white">
                        {cap}
                        {g.year ? ` · ${g.year}` : ''}
                      </span>
                    )}
                  </a>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Document archive (flow 8.0) ── */}
        <section id="archive" className="mt-10 scroll-mt-6">
          <SectionHead
            kicker={t('وثائق', 'Documents')}
            title={t('أرشيف الوثائق', 'Document archive')}
            note={documents.length ? t(`${documents.length} وثيقة`, `${documents.length} documents`) : undefined}
          />
          {documents.length === 0 ? (
            <EmptyHint
              ar="سجلات الأرض والشهادات والوثائق القانونية ستُجمع هنا."
              en="Land records, testimonies, and legal documents will be gathered here."
            />
          ) : (
            <ul className="space-y-2">
              {documents.map((d, i) => {
                const label = pick(d.label_ar, d.label_en) ?? d.url;
                return (
                  <li key={`${d.url}-${i}`}>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-center gap-3 rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-3 text-sm transition-all hover:-translate-y-0.5 hover:border-[var(--jt-olive-400)]"
                    >
                      <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[var(--jt-olive-100)] text-[var(--jt-olive-700)]">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-[var(--jt-stone-800)]">{label}</span>
                      <ExternalLink className="h-3.5 w-3.5 flex-none text-[var(--jt-stone-400)] transition-colors group-hover:text-[var(--jt-olive-600)]" />
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ── External resources + sourcing note ── */}
        {(isDepopulated || externalLinks.length > 0) && (
          <section id="resources" className="mt-10 scroll-mt-6">
            {externalLinks.length > 0 && (
              <>
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--jt-olive-700)]">
                  {t('مصادر خارجية', 'External resources')}
                </p>
                <div className="mb-5 flex flex-wrap gap-2">
                  {externalLinks.map((link) => {
                    const label = pick(link.label_ar, link.label_en) ?? link.url;
                    return (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group inline-flex items-center gap-2 rounded-full border border-[var(--jt-stone-200)] bg-[var(--card)] px-4 py-2 text-sm text-[var(--jt-stone-800)] transition-all hover:-translate-y-0.5 hover:border-[var(--jt-olive-400)] hover:shadow-[var(--jt-shadow-sm)]"
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-[var(--jt-olive-600)]" />
                        <span className="font-medium">{label}</span>
                      </a>
                    );
                  })}
                </div>
              </>
            )}
            <div className="rounded-2xl border-s-4 border-[var(--jt-terra-500)] bg-[var(--jt-terra-50)]/50 p-4">
              <p className="mb-1 text-xs font-bold text-[var(--jt-terra-600)]">
                {t('لماذا لا تنسخ هذه الصفحة محتوى iReturn مباشرة', "Why this page doesn't copy iReturn directly")}
              </p>
              <p
                className="text-[13px] text-[var(--jt-stone-800)]"
                style={{ lineHeight: isAR ? 1.9 : 1.6 }}
              >
                {t(
                  'النص التاريخي في هذه الصفحة مكتوب بشكل مستقل من مصادر متاحة للعامة، ولا ينسخ محتوى الأرشيفات المحمية بحقوق نشر (مثل iReturn التابع لمنظمة Zochrot). نوفّر بدلًا من ذلك روابط خارجية للبحث الأعمق.',
                  "This page's historical text is written independently from public-domain sources and does not reproduce copyrighted archive write-ups (such as Zochrot's iReturn). We link out to them for deeper research instead.",
                )}
              </p>
            </div>
          </section>
        )}

        {/* ── CTA ── */}
        <section className="mt-10 rounded-2xl border border-[var(--jt-olive-200)]/60 bg-[var(--jt-olive-50)]/50 p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xl font-bold text-[var(--jt-olive-900)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
                {t('هل جذورك من هنا؟', 'Are your roots from here?')}
              </p>
              <p className="mt-1 text-sm text-[var(--jt-stone-700)]">
                {t('اربط شجرتك بهذا المكان واجعل الذاكرة أوسع.', 'Link your tree to this place — make the memory wider.')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/tree"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--jt-olive-600)] px-5 py-2.5 text-sm font-semibold text-[var(--jt-stone-50)] shadow-[var(--jt-shadow-sm)] transition-colors hover:bg-[var(--jt-olive-700)]"
              >
                <Plus className="h-4 w-4" />
                {t('اربط فردًا', 'Link a person')}
              </Link>
              <Link
                href={`/search?placeId=${place.id}`}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-300)]/70 bg-[var(--card)] px-5 py-2.5 text-sm font-semibold text-[var(--jt-olive-800)] transition-colors hover:bg-[var(--jt-olive-100)]"
              >
                <TreePine className="h-4 w-4" />
                {t('ابحث في هذا المكان', 'Search in this place')}
              </Link>
            </div>
          </div>
        </section>
        <div className="h-10" />
      </div>
    </div>
  );
}

function HeroMeta({ value, label, ltr }: { value: string; label: string; ltr?: boolean }) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-white" dir={ltr ? 'ltr' : undefined}>
        {value}
      </p>
      <p className="text-[11px] text-white/65">{label}</p>
    </div>
  );
}

function Stat({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="rounded-2xl bg-[var(--jt-gold-50)] p-3 text-center">
      <p className="text-2xl font-bold text-[var(--jt-gold-700)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
        {value == null ? '—' : value.toLocaleString()}
      </p>
      <p className="mt-0.5 text-[10px] font-medium text-[var(--jt-stone-500)]">{label}</p>
    </div>
  );
}

function SectionHead({ kicker, title, note }: { kicker: string; title: string; note?: string }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--jt-olive-700)]">{kicker}</p>
        <h2 className="text-2xl font-bold text-[var(--jt-olive-900)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
          {title}
        </h2>
      </div>
      {note && <span className="text-xs text-[var(--jt-stone-500)]">{note}</span>}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  title,
  sub,
  href,
  soon,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
  href?: string;
  soon?: string;
}) {
  const inner = (
    <>
      <Icon className="mt-0.5 h-4 w-4 flex-none text-[var(--jt-olive-600)]" />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[var(--jt-stone-900)]">{title}</span>
          {soon && (
            <span className="rounded-full bg-[var(--jt-stone-100)] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--jt-stone-500)]">
              {soon}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-[var(--jt-stone-500)]">{sub}</p>
      </div>
    </>
  );
  const cls =
    'flex items-start gap-2.5 rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-3 text-start transition-all hover:border-[var(--jt-olive-400)] hover:bg-[var(--jt-olive-50)]/50';
  if (href) {
    return (
      <a href={href} className={cls}>
        {inner}
      </a>
    );
  }
  return <div className={`${cls} cursor-default opacity-80`}>{inner}</div>;
}

function InfoCard({
  icon: Icon,
  title,
  body,
  source,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  source?: string | null;
}) {
  const { locale } = useLocale();
  return (
    <div className="mt-3 rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-4 md:p-5">
      <h3
        className="mb-2 flex items-center gap-2 text-[15px] font-bold text-[var(--jt-olive-900)]"
        style={{ fontFamily: 'var(--jt-font-display)' }}
      >
        <Icon className="h-4 w-4 text-[var(--jt-olive-600)]" />
        {title}
      </h3>
      <p className="text-[14px] text-[var(--jt-stone-800)]" style={{ lineHeight: locale === 'ar' ? 1.95 : 1.7 }}>
        {body}
      </p>
      {source && (
        <p className="mt-3 flex items-start gap-1.5 border-t border-[var(--jt-stone-200)]/60 pt-3 text-[11px] text-[var(--jt-stone-500)]">
          <FileText className="mt-0.5 h-3 w-3 flex-none" />
          <span>{source}</span>
        </p>
      )}
    </div>
  );
}

function EmptyHint({ ar, en }: { ar: string; en: string }) {
  const { t } = useLocale();
  return (
    <div className="rounded-2xl border border-dashed border-[var(--jt-olive-300)]/60 bg-[var(--jt-olive-50)]/40 p-6 text-center text-sm text-[var(--jt-stone-700)]">
      {t(ar, en)}
    </div>
  );
}
