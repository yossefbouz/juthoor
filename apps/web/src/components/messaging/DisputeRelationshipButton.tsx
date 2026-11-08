'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquareWarning } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';
import { openThreadFromRelationshipDispute } from '@/data/user/messages';

/** Entry point for W4.5 relationship_dispute messaging. */
export function DisputeRelationshipButton({
  familyId,
  className,
}: {
  familyId: string;
  className?: string;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function dispute() {
    setBusy(true);
    setError(null);
    try {
      const threadId = await openThreadFromRelationshipDispute({
        familyId,
        note: t(
          'أبلغت عن نزاع في هذه العلاقة. يرجى المراجعة.',
          'I disputed this relationship. Please review.',
        ),
      });
      router.push(`/messages/${threadId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('فشل فتح المحادثة', 'Could not open thread'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={busy}
        onClick={() => void dispute()}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--jt-terra-300)] bg-[var(--jt-terra-50)] px-3 py-1.5 text-xs font-semibold text-[var(--jt-terra-700)] transition hover:bg-[var(--jt-terra-100)] disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <MessageSquareWarning className="h-3.5 w-3.5" />
        )}
        {t('نزاع / مراسلة المشرف', 'Dispute / message admin')}
      </button>
      {error && <p className="mt-1 text-[11px] text-[var(--jt-terra-700)]">{error}</p>}
    </div>
  );
}
