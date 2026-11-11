'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  GitBranch,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Upload,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { FamilyChart } from '@/components/tree/FamilyChart';
import { DiscoveryTabs } from '@/components/discovery/DiscoveryTabs';
import type { TreeSnapshot } from '@/lib/tree/types';

export type DashboardData = {
  treeId: string;
  treeName: string;
  personsCount: number;
  recentPersons: Array<{
    id: string;
    display_name_ar: string | null;
    display_name_en: string | null;
    gender: string | null;
    created_at: string;
  }>;
  villagesDiscover: Array<{
    id: string;
    name_ar: string;
    name_en: string | null;
    district_ar: string | null;
    district_en: string | null;
    depopulated_year: number | null;
  }>;
  userOrigins: Array<{
    place_id: string | null;
  }>;
  /** Full tree snapshot for the inline mini-chart preview. Null when load failed
   *  or tree is empty — the UI falls back to an empty-state CTA in that case. */
  snapshot: TreeSnapshot | null;
  /**
   * D11: verification remains post-signup (/verify) pending product diagram update.
   * True when the user has no approved identity_verifications row.
   */
  needsVerification: boolean;
  verificationStatus: 'pending' | 'approved' | 'rejected' | null;
  /** Staff shortcut strip on the dashboard (admins + moderators). */
  staff?: { isAdmin: boolean } | null;
};

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay, ease: 'easeOut' as const },
});

export function DashboardClient({ data }: { data: DashboardData }) {
  const { t, locale, dir } = useLocale();
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;
  const isEmpty = data.personsCount === 0;

  return (
    <div dir={dir} className="relative min-h-full bg-[var(--background)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(ellipse_at_top,_var(--jt-olive-100)_0%,_transparent_65%)] opacity-60" />
      </div>

      <div className="mx-auto max-w-7xl px-6 py-10 md:px-10 md:py-14">
        {/* Header */}
        <motion.header {...fade(0)} className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
              <Sparkles className="h-3 w-3" />
              {t('لوحة الجذور', 'Your Roots')}
            </p>
            <h1
              className="text-4xl font-bold text-[var(--jt-olive-900)] md:text-5xl"
              style={{ fontFamily: 'var(--jt-font-display)' }}
            >
              {t('أهلًا بك في جذورك', 'Welcome to your roots')}
            </h1>
            <p className="mt-2 text-[var(--jt-stone-600)]">
              {t(
                'كل شيء يبدأ من اسم. تابع بناء شجرتك واكتشف قراك.',
                'It all starts with a name. Keep building your tree and rediscover your villages.',
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/tree"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--jt-olive-600)] px-5 py-2.5 text-sm font-semibold text-[var(--jt-stone-50)] shadow-[var(--jt-shadow-sm)] transition-colors hover:bg-[var(--jt-olive-700)]"
            >
              <GitBranch className="h-4 w-4" />
              {t('افتح الشجرة', 'Open tree')}
            </Link>
          </div>
        </motion.header>

        {data.staff ? (
          <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--jt-olive-200)]/70 bg-[var(--jt-olive-50)]/50 px-4 py-3 text-sm">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--jt-olive-700)]">
              {t('الفريق', 'Staff')}
            </span>
            <Link
              href="/admin/verifications"
              className="rounded-full border border-[var(--jt-stone-200)] bg-[var(--card)] px-3 py-1 text-xs font-semibold text-[var(--jt-olive-800)] hover:bg-[var(--jt-olive-100)]"
            >
              {t('التوثيق', 'Verifications')}
            </Link>
            <Link
              href="/admin/appeals"
              className="rounded-full border border-[var(--jt-stone-200)] bg-[var(--card)] px-3 py-1 text-xs font-semibold text-[var(--jt-olive-800)] hover:bg-[var(--jt-olive-100)]"
            >
              {t('الاستئنافات', 'Appeals')}
            </Link>
            {data.staff.isAdmin ? (
              <>
                <Link
                  href="/admin/review"
                  className="rounded-full border border-[var(--jt-stone-200)] bg-[var(--card)] px-3 py-1 text-xs font-semibold text-[var(--jt-olive-800)] hover:bg-[var(--jt-olive-100)]"
                >
                  {t('المطابقات', 'Matches')}
                </Link>
                <Link
                  href="/admin/card-check"
                  className="rounded-full border border-[var(--jt-stone-200)] bg-[var(--card)] px-3 py-1 text-xs font-semibold text-[var(--jt-olive-800)] hover:bg-[var(--jt-olive-100)]"
                >
                  {t('البطاقات', 'Card check')}
                </Link>
                <Link
                  href="/admin/moderators"
                  className="rounded-full border border-[var(--jt-stone-200)] bg-[var(--card)] px-3 py-1 text-xs font-semibold text-[var(--jt-olive-800)] hover:bg-[var(--jt-olive-100)]"
                >
                  {t('المشرفون', 'Moderators')}
                </Link>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Verification banner until approved */}
        {data.needsVerification ? (
          <div className="mb-8 rounded-2xl border border-[var(--jt-gold-400)]/70 bg-[var(--jt-gold-50)]/70 px-4 py-3 shadow-[var(--jt-shadow-sm)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[var(--jt-gold-700)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--jt-olive-900)]">
                    {data.verificationStatus === 'pending'
                      ? t('طلب التوثيق قيد المراجعة', 'Verification request pending review')
                      : data.verificationStatus === 'rejected'
                        ? t('لم يُقبل طلب التوثيق — يمكنك إعادة الإرسال أو الاستئناف', 'Verification was rejected — you can resubmit or appeal')
                        : t('خطوة تالية: توثيق الهوية', 'Next step: verify your identity')}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--jt-stone-600)]">
                    {t(
                      'أكمل التوثيق من /register/complete أو /verify للحصول على صلاحية التحرير.',
                      'Complete verification from /register/complete or /verify to gain write access.',
                    )}
                  </p>
                </div>
              </div>
              <Link
                href="/verify"
                className="inline-flex items-center gap-2 rounded-full bg-[var(--jt-olive-600)] px-4 py-2 text-sm font-semibold text-[var(--jt-stone-50)] hover:bg-[var(--jt-olive-700)]"
              >
                {t('الانتقال إلى التوثيق', 'Go to verify')}
              </Link>
            </div>
          </div>
        ) : null}
        {/* Discovery tabs — 5 dimensions of search */}
        <div className="mb-8">
          <DiscoveryTabs />
        </div>

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          {/* Tree status — big card */}
          <motion.section
            {...fade(0.1)}
            className="relative overflow-hidden rounded-3xl border border-[var(--jt-olive-200)]/50 bg-[var(--card)] p-8 shadow-[var(--jt-shadow-sm)]"
          >
            <div aria-hidden className="absolute -end-20 -top-20 h-64 w-64 rounded-full bg-[var(--jt-olive-50)] opacity-70" />
            <div aria-hidden className="absolute -end-10 bottom-0 h-40 w-40 rounded-full bg-[var(--jt-gold-100)] opacity-60" />
            <div className="relative">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--jt-olive-700)]">
                {t('شجرتك الحالية', 'Your tree')}
              </p>
              <h2
                className="text-3xl font-bold text-[var(--jt-olive-900)]"
                style={{ fontFamily: 'var(--jt-font-display)' }}
              >
                {data.treeName}
              </h2>
              <div className="mt-6 grid grid-cols-3 gap-4 rounded-2xl border border-[var(--jt-stone-200)]/70 bg-[var(--jt-stone-50)]/60 p-5">
                <Stat
                  label={t('أفراد', 'People')}
                  value={data.personsCount.toString()}
                  accent="olive"
                />
                <Stat
                  label={t('أصول', 'Villages')}
                  value={new Set(data.userOrigins.map((o) => o.place_id).filter(Boolean)).size.toString()}
                  accent="gold"
                />
                <Stat
                  label={t('منذ', 'Since')}
                  value={t('اليوم', 'Today')}
                  accent="terra"
                />
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/tree/${data.treeId}/add-person`}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--jt-olive-600)] px-5 py-2.5 text-sm font-semibold text-[var(--jt-stone-50)] shadow-[var(--jt-shadow-sm)] transition-colors hover:bg-[var(--jt-olive-700)]"
                >
                  <Plus className="h-4 w-4" />
                  {t('أضِف فردًا', 'Add a person')}
                </Link>
                <Link
                  href={`/tree/${data.treeId}/chart`}
                  className="inline-flex items-center gap-2 rounded-full border border-[var(--jt-olive-300)]/60 px-5 py-2.5 text-sm font-semibold text-[var(--jt-olive-800)] transition-colors hover:bg-[var(--jt-olive-50)]"
                >
                  {t('الشجرة الكاملة', 'Full chart')}
                  <Arrow className="h-3.5 w-3.5" />
                </Link>
              </div>

              {isEmpty && (
                <div className="mt-6 rounded-2xl border border-dashed border-[var(--jt-olive-300)]/70 bg-[var(--jt-olive-50)]/50 p-5 text-sm text-[var(--jt-olive-800)]">
                  <p
                    className="font-semibold"
                    style={{ fontFamily: 'var(--jt-font-display)' }}
                  >
                    {t('شجرتك لا تزال فارغة', 'Your tree is still empty')}
                  </p>
                  <p className="mt-1 text-[var(--jt-stone-700)]">
                    {t(
                      'ابدأ بإضافة نفسك. ستتدرج من هنا إلى والديك وأجدادك.',
                      'Start by adding yourself. You will then build toward parents and grandparents.',
                    )}
                  </p>
                  <Link
                    href={`/tree/${data.treeId}/add-self`}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--jt-gold-400)] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--jt-olive-900)] transition-colors hover:bg-[var(--jt-gold-300)]"
                  >
                    {t('أضِف نفسك', 'Add yourself')}
                    <Arrow className="h-3.5 w-3.5" />
                  </Link>
                </div>
              )}
            </div>
          </motion.section>

          {/* Right column — quick actions + recent */}
          <div className="grid gap-6">
            <motion.section
              {...fade(0.2)}
              className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-6 shadow-[var(--jt-shadow-sm)]"
            >
              <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--jt-stone-500)]">
                {t('إجراءات سريعة', 'Quick actions')}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <QuickAction
                  icon={Plus}
                  label={t('أضِف فردًا', 'Add person')}
                  href={`/tree/${data.treeId}/add-person`}
                />
                <QuickAction
                  icon={Upload}
                  label={t('استيراد شجرة من منصة أخرى', 'Import a tree from another platform')}
                  href={`/tree/${data.treeId}`}
                />
                <QuickAction
                  icon={Search}
                  label={t('ابحث عن ذويك', 'Find relatives')}
                  href="/tree"
                />
                <QuickAction
                  icon={Users}
                  label={t('ادعُ أحد أقاربك', 'Invite family')}
                  href={`/tree/${data.treeId}`}
                />
              </div>
            </motion.section>

            <motion.section
              {...fade(0.3)}
              className="rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-6 shadow-[var(--jt-shadow-sm)]"
            >
              <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--jt-stone-500)]">
                {t('أحدث الإضافات', 'Recently added')}
              </h3>
              {data.recentPersons.length === 0 ? (
                <p className="text-sm text-[var(--jt-stone-500)]">
                  {t(
                    'لا يوجد أفراد بعد. كل شجرة تبدأ باسم واحد.',
                    'No people yet. Every tree starts with a single name.',
                  )}
                </p>
              ) : (
                <ul className="space-y-2">
                  {data.recentPersons.map((p) => {
                    const label =
                      locale === 'ar'
                        ? p.display_name_ar || p.display_name_en
                        : p.display_name_en || p.display_name_ar;
                    return (
                      <li key={p.id}>
                        <Link
                          href={`/tree/${data.treeId}/person/${p.id}`}
                          className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2 text-sm transition-colors hover:border-[var(--jt-olive-200)] hover:bg-[var(--jt-olive-50)]/40"
                        >
                          <span
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[var(--jt-olive-100)] text-xs font-bold text-[var(--jt-olive-800)]"
                            style={{ fontFamily: 'var(--jt-font-display)' }}
                          >
                            {(label ?? '·').slice(0, 1)}
                          </span>
                          <span className="flex-1 truncate text-[var(--jt-stone-800)]">{label}</span>
                          <Arrow className="h-3.5 w-3.5 text-[var(--jt-stone-400)]" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </motion.section>
          </div>
        </div>

        {/* Inline tree preview — small version of the family chart with a
            "see full" CTA. Hidden when the tree is empty (the empty-state
            CTA in the Tree-status card already covers that case). */}
        {data.snapshot && data.personsCount > 0 && (
          <motion.section {...fade(0.32)} className="mt-10">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--jt-olive-700)]">
                  {t('شجرتك بنظرة', 'Your tree at a glance')}
                </p>
                <h3
                  className="text-xl font-bold text-[var(--jt-olive-900)] md:text-2xl"
                  style={{ fontFamily: 'var(--jt-font-display)' }}
                >
                  {data.treeName}
                </h3>
              </div>
              <Link
                href={`/tree/${data.treeId}`}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--jt-olive-700)] hover:text-[var(--jt-olive-900)]"
              >
                {t('عرض الشجرة كاملة', 'Open full tree')}
                <Arrow className="h-3 w-3" />
              </Link>
            </div>
            <div className="relative overflow-hidden rounded-3xl border border-[var(--jt-stone-200)] bg-[var(--card)] shadow-[var(--jt-shadow-sm)]">
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-[var(--card)] to-transparent" />
              <div className="max-h-[320px] overflow-hidden">
                <FamilyChart
                  treeId={data.treeId}
                  snapshot={data.snapshot}
                  rootPersonId={data.snapshot.persons[0].id}
                />
              </div>
            </div>
          </motion.section>
        )}

        {/* Discover villages */}
        <motion.section {...fade(0.35)} className="mt-14">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--jt-olive-700)]">
                {t('اكتشف', 'Discover')}
              </p>
              <h2
                className="text-2xl font-bold text-[var(--jt-olive-900)] md:text-3xl"
                style={{ fontFamily: 'var(--jt-font-display)' }}
              >
                {t('قرى ومدن فلسطينية', 'Palestinian villages & cities')}
              </h2>
            </div>
            <p className="hidden text-xs text-[var(--jt-stone-500)] md:block">
              {t(
                'انقر على قرية لربط جذورك بها',
                'Tap a village to link your roots to it',
              )}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.villagesDiscover.map((v, i) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.5, delay: i * 0.04 }}
              >
                <Link
                  href={`/tree/${data.treeId}/add-person?origin=${v.id}`}
                  className="group flex items-center justify-between gap-4 rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--card)] p-5 shadow-[var(--jt-shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[var(--jt-olive-400)] hover:shadow-[var(--jt-shadow-md)]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-[var(--jt-olive-600)]" />
                      <span
                        className="text-lg font-bold text-[var(--jt-olive-900)]"
                        style={{ fontFamily: 'var(--jt-font-display)' }}
                      >
                        {v.name_ar}
                      </span>
                    </div>
                    {v.name_en && (
                      <p className="mt-0.5 truncate text-xs uppercase tracking-[0.15em] text-[var(--jt-stone-500)]">
                        {v.name_en}
                        {v.district_ar ? ` · ${locale === 'ar' ? v.district_ar : v.district_en ?? v.district_ar}` : ''}
                      </p>
                    )}
                  </div>
                  {v.depopulated_year && (
                    <span className="rounded-full bg-[var(--jt-terra-50)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--jt-terra-600)]">
                      {v.depopulated_year}
                    </span>
                  )}
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.section>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: 'olive' | 'gold' | 'terra';
}) {
  const color =
    accent === 'olive'
      ? 'var(--jt-olive-700)'
      : accent === 'gold'
        ? 'var(--jt-gold-600)'
        : 'var(--jt-terra-600)';
  return (
    <div className="flex flex-col">
      <span
        className="text-3xl font-bold"
        style={{ fontFamily: 'var(--jt-font-display)', color }}
      >
        {value}
      </span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-stone-500)]">
        {label}
      </span>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-start gap-2 rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--jt-stone-50)]/50 p-4 text-sm font-semibold text-[var(--jt-stone-800)] transition-all hover:-translate-y-0.5 hover:border-[var(--jt-olive-400)] hover:bg-[var(--jt-olive-50)]/60 hover:text-[var(--jt-olive-800)]"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--jt-olive-600)] text-[var(--jt-stone-50)] transition-colors group-hover:bg-[var(--jt-olive-700)]">
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </Link>
  );
}
