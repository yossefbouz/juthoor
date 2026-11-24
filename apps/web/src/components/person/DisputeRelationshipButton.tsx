'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Flag, MessageSquare } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { Button } from '@/components/ui/button';
import { openOrCreateMessageThread } from '@/data/user/messages';
import {
  raiseRelationshipDisputeAction,
  resolveRelationshipDisputeAction,
  validateRelationshipAction,
} from '@/data/user/relationshipDisputes';
import type { OpenDisputeView } from '@/lib/tree/relationshipFlags';

/** AIO2 4.X.1.1.8: validate or dispute a relationship from the 360 person view. */
export function DisputeRelationshipButton({
  treeId,
  focusPersonId,
  relatedPersonId,
  relationType,
  initiallyValidated = false,
  openDisputes = [],
  canResolve = false,
}: {
  treeId: string;
  focusPersonId: string;
  relatedPersonId: string | null;
  relationType: string;
  /** The relationship is already flagged Validated (by anyone). */
  initiallyValidated?: boolean;
  /** Open disputes on this relationship that the viewer may see. */
  openDisputes?: readonly OpenDisputeView[];
  /** The viewer can write the tree, so may resolve or dismiss a dispute. */
  canResolve?: boolean;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'dispute' | null>('idle');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<'validated' | 'disputed' | null>(null);
  const [closedIds, setClosedIds] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!relatedPersonId) return null;

  const disputes = openDisputes.filter((d) => !closedIds.includes(d.id));
  const hasOwnDispute = disputes.some((d) => d.mine);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('تعذر الإرسال', 'Could not send'));
    } finally {
      setBusy(false);
    }
  }

  const validate = () =>
    run(async () => {
      await validateRelationshipAction({
        treeId,
        personA: focusPersonId,
        personB: relatedPersonId,
        relationType,
      });
      setDone('validated');
      setMode('idle');
    });

  const dispute = () =>
    run(async () => {
      const { threadId } = await raiseRelationshipDisputeAction({
        treeId,
        personA: focusPersonId,
        personB: relatedPersonId,
        relationType,
        note: note.trim() || undefined,
      });
      setDone('disputed');
      setMode('idle');
      if (threadId) router.push(`/messages/${threadId}`);
    });

  const openConversation = (disputeId: string) =>
    run(async () => {
      const threadId = await openOrCreateMessageThread({
        contextType: 'relationship_dispute',
        contextId: disputeId,
      });
      router.push(`/messages/${threadId}`);
    });

  const close = (disputeId: string, status: 'resolved' | 'dismissed') =>
    run(async () => {
      await resolveRelationshipDisputeAction({
        disputeId,
        status,
        treeId,
        personId: focusPersonId,
      });
      setClosedIds((ids) => [...ids, disputeId]);
    });

  return (
    <div className="mt-3">
      {mode !== 'dispute' ? (
        <div className="flex flex-wrap items-center gap-2">
          {initiallyValidated || done === 'validated' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[var(--jt-olive-400)] px-2.5 py-1 text-xs font-semibold text-[var(--jt-olive-700)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('تم توثيق الصلة', 'Validated')}
            </span>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={validate} disabled={busy}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {busy ? t('…', '…') : t('توثيق الصلة', 'Validate')}
            </Button>
          )}
          {done === 'disputed' ? (
            <span className="text-xs font-semibold text-[var(--jt-olive-700)]">
              {t('تم تسجيل الاعتراض.', 'Dispute recorded.')}
            </span>
          ) : hasOwnDispute ? null : (
            <Button type="button" variant="outline" size="sm" onClick={() => setMode('dispute')}>
              <Flag className="h-3.5 w-3.5" />
              {t('اعترض على الصلة', 'Dispute')}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2 rounded-xl border border-[var(--jt-terra-200)] bg-[var(--jt-terra-50)]/40 p-3">
          <p className="text-xs text-[var(--jt-stone-700)]">
            {t(
              'سيبلغ مالك الشجرة بهذا الاعتراض وتفتح محادثة معه.',
              'The tree owner will be notified and a conversation with them will open.',
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
      {disputes.map((d) => (
        <div
          key={d.id}
          className="mt-2 space-y-2 rounded-xl border border-[var(--jt-terra-200)] bg-[var(--jt-terra-50)]/40 p-3"
        >
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--jt-terra-600)]">
            <Flag className="h-3.5 w-3.5" />
            {t('نزاع مفتوح', 'Open dispute')}
          </p>
          {d.note && <p className="text-sm text-[var(--jt-stone-700)]">{d.note}</p>}
          {(d.canMessage || canResolve) && (
            <div className="flex flex-wrap gap-2">
              {d.canMessage && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => openConversation(d.id)}
                  disabled={busy}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  {t('فتح المحادثة', 'Open conversation')}
                </Button>
              )}
              {canResolve && (
                <>
                  <Button type="button" size="sm" onClick={() => close(d.id, 'resolved')} disabled={busy}>
                    {t('تمت المعالجة', 'Mark resolved')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => close(d.id, 'dismissed')}
                    disabled={busy}
                  >
                    {t('رفض الاعتراض', 'Dismiss')}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      {error && mode !== 'dispute' && (
        <p className="mt-1 text-xs text-[var(--jt-terra-600)]">{error}</p>
      )}
    </div>
  );
}
