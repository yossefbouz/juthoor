import Link from 'next/link';

/**
 * Branded bilingual 404. Static server component — shows both languages so it
 * needs no locale context, no client JS; entrance is CSS-only (tw-animate-css).
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[var(--background)] px-6 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--jt-olive-100)_0%,_transparent_55%)] opacity-60"
      />
      <div aria-hidden className="jt-tatreez-dark pointer-events-none absolute inset-0 opacity-[0.04]" />

      <div className="relative animate-in fade-in slide-in-from-bottom-4 duration-700 [animation-fill-mode:both] motion-reduce:animate-none">
        <p
          className="text-[clamp(5rem,18vw,9rem)] font-bold leading-none text-[var(--jt-olive-200)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
          aria-hidden
        >
          ٤٠٤
        </p>
        <p className="-mt-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-[var(--jt-stone-500)]">404</p>

        <h1
          dir="rtl"
          lang="ar"
          className="mt-6 text-2xl font-bold text-[var(--jt-olive-900)] md:text-3xl"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          هذه الصفحة غير موجودة — لكنّ جذورك موجودة.
        </h1>
        <p className="mt-2 text-[15px] text-[var(--jt-stone-600)]">
          This page doesn&apos;t exist — but your roots do.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="jt-btn-shine inline-flex items-center gap-2 rounded-lg bg-[var(--jt-olive-700)] px-6 py-3 text-sm font-semibold text-white dark:text-[var(--jt-stone-50)] shadow-[0_10px_24px_-10px_var(--jt-olive-700)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--jt-olive-800)]"
          >
            <span dir="rtl" lang="ar">الصفحة الرئيسية</span>
            <span aria-hidden>·</span>
            <span>Home</span>
          </Link>
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--jt-olive-300)] px-6 py-3 text-sm font-semibold text-[var(--jt-olive-800)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--jt-olive-50)]"
          >
            <span dir="rtl" lang="ar">ابدأ شجرتك</span>
            <span aria-hidden>·</span>
            <span>Start your tree</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
