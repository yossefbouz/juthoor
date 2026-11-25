import { notFound } from 'next/navigation';
import { isCurrentUserAdmin } from '@/data/admin/requireAdmin';
import { getHiddenReviewCount, listReviewQueue } from '@/data/admin/review';
import { AdminReviewClient } from './AdminReviewClient';

export const metadata = {
  title: 'مراجعة المطابقات — Match review | Juthoor',
};

export default async function AdminReviewPage() {
  // Non-admins get a 404 — the page does not exist for them.
  if (!(await isCurrentUserAdmin())) notFound();
  const initialCards = await listReviewQueue().catch(() => []);
  const initialHidden = await getHiddenReviewCount().catch(() => ({ count: 0, floor: null }));
  return <AdminReviewClient initialCards={initialCards} initialHidden={initialHidden} />;
}
