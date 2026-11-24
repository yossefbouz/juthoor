'use client';

import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

import { useLocale } from '@/contexts/LocaleContext';

/**
 * Segmented OTP code entry with `length` cells. Auto-advances on input,
 * supports paste, backspace jump-back, and arrow-key navigation. Calls
 * `onComplete(code)` once all `length` cells are filled. The submit button
 * (in the parent) also accepts any 6–8 digit code via `isValidOtp`, so a
 * shorter-than-`length` valid code can still be submitted manually.
 */
export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (full: string) => void;
  length?: number;
  disabled?: boolean;
}) {
  const { t } = useLocale();
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const cells = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    // Autofocus the first empty cell on mount
    const firstEmpty = cells.findIndex((c) => !c);
    refs.current[Math.max(0, firstEmpty)]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setDigit(idx: number, digit: string) {
    const cleaned = digit.replace(/\D/g, '').slice(0, 1);
    const arr = [...cells];
    arr[idx] = cleaned;
    const next = arr.join('').slice(0, length);
    onChange(next);
    if (cleaned && idx < length - 1) refs.current[idx + 1]?.focus();
    if (next.length === length && onComplete) onComplete(next);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>, idx: number) {
    if (e.key === 'Backspace' && !cells[idx] && idx > 0) {
      e.preventDefault();
      const arr = [...cells];
      arr[idx - 1] = '';
      onChange(arr.join(''));
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      refs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      e.preventDefault();
      refs.current[idx + 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const text = (e.clipboardData.getData('text') ?? '').replace(/\D/g, '').slice(0, length);
    if (!text) return;
    e.preventDefault();
    onChange(text);
    if (text.length === length && onComplete) onComplete(text);
    refs.current[Math.min(text.length, length - 1)]?.focus();
  }

  return (
    <div
      // Force LTR so the leftmost cell is always digit 1, regardless of page dir.
      dir="ltr"
      className="flex items-center justify-center gap-2"
      role="group"
      aria-label={t(`رمز التحقق من ${length} أرقام`, `${length}-digit verification code`)}
    >
      {cells.map((c, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={c}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => handleKey(e, i)}
          onPaste={i === 0 ? handlePaste : undefined}
          disabled={disabled}
          className="h-14 w-12 rounded-xl border-2 border-[var(--jt-stone-200)] bg-[var(--background)] text-center text-2xl font-bold tabular-nums text-[var(--jt-olive-900)] outline-none transition-all focus:border-[var(--jt-olive-500)] focus:ring-2 focus:ring-[var(--jt-olive-100)] disabled:opacity-50"
          aria-label={t(`الرقم ${i + 1}`, `digit ${i + 1}`)}
        />
      ))}
    </div>
  );
}
