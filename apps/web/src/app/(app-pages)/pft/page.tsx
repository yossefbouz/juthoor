import { listMyPftGroups } from '@/data/user/pft';
import { PftClient } from './PftClient';

export const metadata = {
  title: 'الشجرة الفلسطينية — Palestinian Family Tree | Juthoor',
  description:
    'Read-only overlay of confirmed person links that form the Palestinian Family Tree for trees you can access.',
};

export default async function PftPage() {
  const groups = await listMyPftGroups().catch(() => []);
  return <PftClient groups={groups} />;
}
