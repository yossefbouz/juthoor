import Link from 'next/link';
import { IsThisYouPanel } from '@/components/tree/IsThisYouPanel';
import { getLinkedPersonId } from '@/data/user/personLink';
import { getMyOpenAppeal } from '@/data/user/appeals';
import {
  getMyVerification,
  listVerifiableTrees,
} from '@/data/user/identityVerification';
import { VerifyClient } from '@/app/(app-pages)/verify/VerifyClient';

export const metadata = {
  title: 'إكمال التسجيل — Complete registration | Juthoor',
  description:
    'Confirm whether you already appear in the Palestinian Family Tree and verify your identity.',
};

/**
 * D10/D11: post sign-up step. PFT "Is this you?" match plus embedded identity
 * verification (same VerifyClient as /verify).
 */
export default async function RegisterCompletePage() {
  const [linkedPersonId, verification, trees] = await Promise.all([
    getLinkedPersonId().catch(() => null),
    getMyVerification().catch(() => null),
    listVerifiableTrees().catch(() => []),
  ]);
  const openAppeal =
    verification?.status === 'rejected'
      ? await getMyOpenAppeal(verification.id).catch(() => null)
      : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 p-4 md:p-8">
      <header className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--jt-olive-700)]">
          التسجيل · Registration
        </p>
        <h1
          className="text-2xl font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          أكمل إعداد حسابك / Finish setting up
        </h1>
        <p className="text-sm text-[var(--jt-stone-600)]" style={{ lineHeight: 1.7 }}>
          ابحث إن كنت مسجّلًا في الشجرة الرئيسية، ثم وثّق هويتك أدناه.
          Search the master tree for yourself, then verify your identity below.
        </p>
      </header>

      <IsThisYouPanel alreadyLinked={Boolean(linkedPersonId)} />

      <section className="space-y-3">
        <h2
          className="text-lg font-bold text-[var(--jt-olive-900)]"
          style={{ fontFamily: 'var(--jt-font-display)' }}
        >
          توثيق الهوية / Identity verification
        </h2>
        <VerifyClient
          compact
          initialVerification={verification}
          trees={trees}
          initialOpenAppeal={openAppeal}
        />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link
          href="/verify"
          className="text-[var(--jt-stone-500)] underline underline-offset-2 hover:text-[var(--jt-olive-700)]"
        >
          فتح صفحة التوثيق الكاملة / Open full /verify page
        </Link>
        <Link
          href="/dashboard"
          className="rounded-full bg-[var(--jt-olive-700)] px-4 py-2 font-medium text-white hover:bg-[var(--jt-olive-800)]"
        >
          متابعة إلى لوحة التحكم / Continue to dashboard
        </Link>
      </div>
    </div>
  );
}
