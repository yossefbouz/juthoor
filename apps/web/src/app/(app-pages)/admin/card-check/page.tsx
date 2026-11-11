import { notFound } from 'next/navigation';
import { isCurrentUserAdmin } from '@/data/admin/requireAdmin';
import { listIdentifierCardRequests } from '@/data/admin/identifierCards';
import { AdminCardCheckClient } from './AdminCardCheckClient';

export const metadata = {
  title: 'التحقق من البطاقات — Card check | Juthoor',
};

export default async function AdminCardCheckPage() {
  // Non-admins get a 404 — the page does not exist for them.
  if (!(await isCurrentUserAdmin())) notFound();
  let requests: Awaited<ReturnType<typeof listIdentifierCardRequests>> = [];
  let loadError: string | null = null;
  try {
    requests = await listIdentifierCardRequests();
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load card-check queue';
  }
  return (
    <AdminCardCheckClient initialRequests={requests} loadError={loadError} />
  );
}
