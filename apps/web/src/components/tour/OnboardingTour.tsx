'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { useLocale } from '@/contexts/LocaleContext';
import { TOUR_STEPS } from '@/lib/tour/tourSteps';
import {
  readLocalTourDone,
  shouldShowTour,
  TOUR_DONE_METADATA_KEY,
  TOUR_REPLAY_PARAM,
  writeLocalTourDone,
} from '@/lib/tour/tourState';
import { createClient } from '@/supabase-clients/client';

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--jt-gold-400)] focus-visible:ring-offset-2';

async function markTourDone(userId: string): Promise<void> {
  writeLocalTourDone(userId);
  try {
    await createClient().auth.updateUser({ data: { [TOUR_DONE_METADATA_KEY]: true } });
  } catch {
    // Offline or signed out: the local flag still stops it on this device,
    // and the next dashboard visit tries the metadata write again.
  }
}

/**
 * First-run guided tour. Opens by itself once, for a member whose completion
 * flag is not set (see tourState.ts), and again whenever the page is opened
 * with `?tour=1` (the "Take the tour" entry in the user menu).
 *
 * Built on the Radix dialog the shadcn Dialog wraps, so Esc closes it and
 * focus stays inside. It uses Radix's own Overlay / Content rather than the
 * shadcn DialogContent because that one pins an English-only close button to
 * the physical right edge and always animates.
 */
export function OnboardingTour({
  userId,
  metadataDone,
}: {
  userId: string;
  /** The completion flag as read from the auth user metadata on the server. */
  metadataDone: boolean;
}) {
  const { t, locale, dir } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const replay = useSearchParams().get(TOUR_REPLAY_PARAM) === '1';

  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const closedHere = useRef(false);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (replay) {
      setIndex(0);
      setOpen(true);
      // Drop ?tour=1 so a reload or the Back button does not reopen the tour.
      router.replace(pathname, { scroll: false });
      return;
    }
    if (closedHere.current) return;
    if (shouldShowTour({ metadataDone, localDone: readLocalTourDone(userId) })) {
      setOpen(true);
    } else if (!metadataDone) {
      // Done on this device only (the metadata write failed earlier): retry.
      void markTourDone(userId);
    }
  }, [replay, metadataDone, userId, router, pathname]);

  function finish() {
    closedHere.current = true;
    setOpen(false);
    void markTourDone(userId);
  }

  function back() {
    // Back disappears on the first step; keep focus inside the dialog.
    if (index === 1) nextRef.current?.focus();
    setIndex((i) => Math.max(0, i - 1));
  }

  const step = TOUR_STEPS[index];
  const total = TOUR_STEPS.length;
  const isLast = index === total - 1;
  const Icon = step.icon;
  const Forward = locale === 'ar' ? ArrowLeft : ArrowRight;
  const progressLabel = t(`الخطوة ${index + 1} من ${total}`, `Step ${index + 1} of ${total}`);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) finish();
      }}
    >
      <DialogPortal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          dir={dir}
          data-testid="onboarding-tour"
          // A stray click on the page must not dismiss a tour that never comes back by itself.
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            nextRef.current?.focus();
          }}
          className="fixed inset-0 z-50 m-auto flex h-fit max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md flex-col gap-5 overflow-y-auto rounded-3xl border border-[var(--jt-olive-200)] bg-[var(--card)] p-6 text-start shadow-lg focus:outline-none motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0"
          style={{ fontFamily: locale === 'ar' ? 'var(--jt-font-arabic)' : 'var(--jt-font-latin)' }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--jt-olive-600)] text-[var(--jt-stone-50)]">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <DialogPrimitive.Close
              aria-label={t('إغلاق الجولة', 'Close the tour')}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--jt-stone-500)] hover:bg-[var(--jt-olive-50)] hover:text-[var(--jt-olive-800)] ${FOCUS_RING}`}
            >
              <X className="h-4 w-4" aria-hidden />
            </DialogPrimitive.Close>
          </div>

          <div aria-live="polite" className="flex flex-col gap-2">
            <DialogTitle
              className="text-xl leading-snug tracking-normal text-[var(--jt-olive-900)]"
              style={{ fontFamily: 'var(--jt-font-display)' }}
            >
              {t(step.titleAr, step.titleEn)}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-[var(--jt-stone-600)]">
              {t(step.bodyAr, step.bodyEn)}
            </DialogDescription>
            {step.href ? (
              <Link
                href={step.href}
                onClick={finish}
                className={`inline-flex items-center gap-1.5 self-start rounded text-sm font-semibold text-[var(--jt-olive-700)] underline-offset-4 hover:underline ${FOCUS_RING}`}
              >
                {t('خذني إلى هناك', 'Take me there')}
                <Forward className="h-4 w-4" aria-hidden />
              </Link>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <div
              role="progressbar"
              aria-label={t('تقدّم الجولة', 'Tour progress')}
              aria-valuemin={1}
              aria-valuemax={total}
              aria-valuenow={index + 1}
              aria-valuetext={progressLabel}
              className="flex gap-1"
            >
              {TOUR_STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1.5 flex-1 rounded-full ${i <= index ? 'bg-[var(--jt-olive-600)]' : 'bg-[var(--jt-stone-200)]'}`}
                />
              ))}
            </div>
            <p className="text-xs text-[var(--jt-stone-500)]">{progressLabel}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isLast ? null : (
              <Button
                type="button"
                variant="ghost"
                className={`rounded-full motion-reduce:transition-none ${FOCUS_RING}`}
                onClick={finish}
              >
                {t('تخطّي', 'Skip')}
              </Button>
            )}
            <div className="ms-auto flex items-center gap-2">
              {index === 0 ? null : (
                <Button
                  type="button"
                  variant="outline"
                  className={`rounded-full motion-reduce:transition-none ${FOCUS_RING}`}
                  onClick={back}
                >
                  {t('السابق', 'Back')}
                </Button>
              )}
              <Button
                ref={nextRef}
                type="button"
                className={`rounded-full motion-reduce:transition-none ${FOCUS_RING}`}
                onClick={isLast ? finish : () => setIndex(index + 1)}
              >
                {isLast ? t('إنهاء', 'Finish') : t('التالي', 'Next')}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
