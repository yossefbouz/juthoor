'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, GitBranch, Route } from 'lucide-react';
import { PathGraph } from './PathGraph';
import { computeAllPathsTo } from '@/data/user/degrees';
import {
  isDegreesOk,
  type AllPathsResult,
  type DegreesOk,
  type DegreesResult,
} from '@/data/user/degrees-types';
import { kinshipLabel } from '@/lib/search/relationLabels';

export function DegreesDialog({
  open,
  onClose,
  data,
  locale,
  t,
}: {
  open: boolean;
  onClose: () => void;
  data: DegreesResult;
  locale: 'ar' | 'en';
  t: <T extends string>(ar: T, en: T) => T;
}) {
  const ok: DegreesOk | null = isDegreesOk(data) ? data : null;
  const [allPaths, setAllPaths] = useState<AllPathsResult>(null);
  const [loadingPaths, setLoadingPaths] = useState(false);
  const [selectedPathIdx, setSelectedPathIdx] = useState(0);

  useEffect(() => {
    if (!open || !ok?.path?.length) {
      setAllPaths(null);
      setSelectedPathIdx(0);
      return;
    }
    const targetId = ok.path[ok.path.length - 1]?.person_id;
    if (!targetId) return;
    let cancelled = false;
    setLoadingPaths(true);
    computeAllPathsTo(targetId, 5)
      .then((res) => {
        if (!cancelled) {
          setAllPaths(res);
          setSelectedPathIdx(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPaths(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, ok]);

  const alternatePaths = allPaths?.paths ?? [];
  const activePath =
    alternatePaths[selectedPathIdx]?.path ??
    ok?.path ??
    [];
  const activeDegrees =
    alternatePaths[selectedPathIdx]?.degrees ?? ok?.degrees ?? 0;

  return (
    <AnimatePresence>
      {open && ok && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--jt-stone-900)]/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-[var(--jt-olive-200)] bg-[var(--card)] p-6 shadow-[var(--jt-shadow-xl)] md:p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute end-4 top-4 rounded-full p-2 text-[var(--jt-stone-500)] transition-colors hover:bg-[var(--jt-stone-100)] hover:text-[var(--jt-stone-800)]"
              aria-label={t('إغلاق', 'Close')}
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-6 text-center">
              <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--jt-olive-50)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--jt-olive-700)]">
                <GitBranch className="h-3 w-3" />
                {t('صلة القرابة', 'Relation')}
              </p>
              <h2
                className="text-3xl font-bold text-[var(--jt-olive-900)]"
                style={{ fontFamily: 'var(--jt-font-display)' }}
              >
                {activeDegrees}° {t('من', '·')} {kinshipLabel(activeDegrees, activePath, locale)}
              </h2>
              <p className="mt-2 text-sm text-[var(--jt-stone-600)]">
                {t(
                  `يمرّ المسار عبر ${Math.max(0, activePath.length - 2)} فردًا بينكما.`,
                  `The path passes through ${Math.max(0, activePath.length - 2)} ${Math.max(0, activePath.length - 2) === 1 ? 'person' : 'people'} between you.`,
                )}
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--jt-stone-200)] bg-[var(--jt-stone-50)]/50 p-4">
              <PathGraph path={activePath} locale={locale} />
            </div>

            <div className="mt-6">
              <p className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-stone-500)]">
                <Route className="h-3.5 w-3.5" />
                {t('كل المسارات', 'All paths')}
              </p>
              {loadingPaths && (
                <p className="text-sm text-[var(--jt-stone-500)]">
                  {t('جاري تحميل المسارات…', 'Loading paths…')}
                </p>
              )}
              {!loadingPaths && alternatePaths.length <= 1 && (
                <p className="text-sm text-[var(--jt-stone-500)]">
                  {t(
                    'مسار واحد ضمن الشجرة (أو أقصر مسار عبر الشجرات).',
                    'One path within the tree (or shortest cross-tree path).',
                  )}
                </p>
              )}
              {!loadingPaths && alternatePaths.length > 1 && (
                <ul className="space-y-2">
                  {alternatePaths.map((p, i) => (
                    <li key={`path-${i}`}>
                      <button
                        type="button"
                        onClick={() => setSelectedPathIdx(i)}
                        className={`w-full rounded-xl border px-4 py-3 text-start text-sm transition-colors ${
                          selectedPathIdx === i
                            ? 'border-[var(--jt-olive-400)] bg-[var(--jt-olive-50)] text-[var(--jt-olive-900)]'
                            : 'border-[var(--jt-stone-200)] hover:border-[var(--jt-olive-300)]'
                        }`}
                      >
                        <span className="font-semibold">
                          {t(`مسار ${i + 1}`, `Path ${i + 1}`)} · {p.degrees}°
                        </span>
                        <span className="ms-2 text-[var(--jt-stone-500)]">
                          {kinshipLabel(p.degrees, p.path, locale)}
                          {' · '}
                          {t(
                            `${Math.max(0, p.path.length - 2)} وسيط`,
                            `${Math.max(0, p.path.length - 2)} hop${Math.max(0, p.path.length - 2) === 1 ? '' : 's'}`,
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {allPaths?.note && (
                <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-[var(--jt-stone-400)]">
                  {t('ضمن رسم القرابة المتاح', 'Within the reachable graph')}
                </p>
              )}
            </div>

            {ok.cached && (
              <p className="mt-4 text-center text-[10px] uppercase tracking-[0.2em] text-[var(--jt-stone-400)]">
                {t('محفوظ في الذاكرة', 'cached')}
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
