import { getMyOpenAppeal } from '@/data/user/appeals';
import { getMyVerification, listVerifiableTrees } from '@/data/user/identityVerification';
import { VerifyClient } from './VerifyClient';

export const metadata = {
  title: 'توثيق الهوية — Verify identity | Juthoor',
  description:
    'Verify your identity and your belonging to a family to gain write access to its tree.',
};

export default async function VerifyPage() {
  const [verification, trees] = await Promise.all([
    getMyVerification().catch(() => null),
    listVerifiableTrees().catch(() => []),
  ]);
  const openAppeal =
    verification?.status === 'rejected'
      ? await getMyOpenAppeal(verification.id).catch(() => null)
      : null;
  return (
    <VerifyClient
      initialVerification={verification}
      trees={trees}
      initialOpenAppeal={openAppeal}
    />
  );
}
