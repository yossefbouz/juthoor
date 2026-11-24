import { type ReactNode } from 'react';
import Link from 'next/link';
import { LocaleToggle } from '@/components/LocaleToggle';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen flex flex-col bg-[var(--background)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_var(--jt-olive-100)_0%,_transparent_55%)] opacity-70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[320px] bg-[radial-gradient(ellipse_at_bottom,_var(--jt-gold-100)_0%,_transparent_60%)] opacity-50"
      />
      <div aria-hidden className="jt-tatreez-dark pointer-events-none absolute inset-x-0 top-0 -z-10 h-[200px] opacity-[0.04]" />
      <header className="border-b border-[var(--jt-stone-200)]/60 bg-[var(--background)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-screen-2xl items-center justify-between px-6 py-4">
          <Link href="/" className="group flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--jt-olive-600)] text-[var(--jt-stone-50)] shadow-[var(--jt-shadow-sm)] transition-transform group-hover:-rotate-3">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21V9" />
                <path d="M12 9c-3-2-5-5-5-7 2 0 5 2 7 4" />
                <path d="M12 9c3-2 5-5 5-7-2 0-5 2-7 4" />
                <path d="M5 17c2 0 4 1 5 3 1-2 3-3 5-3" />
                <path d="M4 13c2-1 4-1 6 1 1-2 3-2 5-1" />
              </svg>
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-xl font-bold text-[var(--jt-olive-700)]" style={{ fontFamily: 'var(--jt-font-display)' }}>
                جذور
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-stone-500)]">
                Juthoor
              </span>
            </span>
          </Link>
          <LocaleToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-full justify-center animate-in fade-in slide-in-from-bottom-4 duration-700 [animation-fill-mode:both] motion-reduce:animate-none">
          {children}
        </div>
      </main>
    </div>
  );
}
