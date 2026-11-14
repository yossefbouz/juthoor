'use client';

import { useState } from 'react';
import { CheckCircle2, Flag } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import {
  raiseRelationshipDisputeAction,
  validateRelationshipAction,
} from '@/data/user/relationshipDisputes';

/** AIO2 4.X.1.1.8: validate or dispute a relationship from the 360 person view. */
export function DisputeRelationshipButton({
  treeId,
  focusPersonId,
  relatedPersonId,
  relationType,
}: {
  treeId: string;
  focusPersonId: string;
  relatedPersonId: string | null;
  relationType: string;
}) {
  const { t } = useLocale();
  const [mode, setMode] = useState<'idle' | 'dispute' | null>('idle');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'validated' | 'disputed' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!relatedPersonId) return null;

  async function validate() {
    setBusy(true);
    setError(null);
    try {
      await validateRelationshipAction({
        treeId,
        personA: focusPersonId,
        personB: relatedPersonId!,
        relationType,
      });
      setDone('validated');
      setMode('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر الإرسال', 'Could not send'));
    } finally {
      setBusy(false);
    }
  }

  async function dispute() {
    setBusy(true);
    setError(null);
    try {
      await raiseRelationshipDisputeAction({
        treeId,
        personA: focusPersonId,
        personB: relatedPersonId!,
        relationType,
        note: note.trim() || undefined,
      });
      setDone('disputed');
      setMode('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر الإرسال', 'Could not send'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      {done === 'validated' ? (
        <p className="text-xs font-semibold text-[var(--jt-olive-700)]">
          {t('تم توثيق الصلة (Validated).', 'Relationship marked Validated.')}
        </p>
      ) : done === 'disputed' ? (
        <p className="text-xs font-semibold text-[var(--jt-olive-700)]">
          {t('تم إرسال النزاع إلى مالك الشجرة.', 'Dispute sent to the tree owner.')}
        </p>
      ) : mode !== 'dispute' ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={validate} disabled={busy}>
            <CheckCircle2 className="h-3.5 w-3.5" />
            {busy ? t('…', '…') : t('توثيق الصلة', 'Validate')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setMode('dispute')}>
            <Flag className="h-3.5 w-3.5" />
            {t('اعترض على الصلة', 'Dispute')}
          </Button>
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-[var(--jt-terra-200)] bg-[var(--jt-terra-50)]/40 p-3">
          <p className="text-xs text-[var(--jt-stone-700)]">
            {t(
              'سيبلغ مالك الشجرة بهذا الاعتراض.',
              'The tree owner will be notified of this dispute.',
            )}
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={t('لماذا تعتقد أن هذه الصلة غير صحيحة؟', 'Why do you think this link is wrong?')}
            className="w-full rounded-lg border border-[var(--jt-stone-200)] bg-[var(--card)] p-2 text-sm outline-none"
          />
          {error && <p className="text-xs text-[var(--jt-terra-600)]">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={dispute} disabled={busy}>
              {busy ? t('يرسل…', 'Sending…') : t('إرسال', 'Submit')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMode('idle')}
              disabled={busy}
            >
              {t('إلغاء', 'Cancel')}
            </Button>
          </div>
        </div>
      )}
      {error && mode !== 'dispute' && (
        <p className="mt-1 text-xs text-[var(--jt-terra-600)]">{error}</p>
      )}
    </div>
  );
}
