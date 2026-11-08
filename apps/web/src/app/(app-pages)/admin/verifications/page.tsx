import { notFound } from 'next/navigation';
import { getStaffRole } from '@/data/admin/requireStaff';
import { listPendingVerifications } from '@/data/user/identityVerification';
import { AdminVerificationsClient } from './AdminVerificationsClient';

export const metadata = {
  title: 'مراجعة التوثيق — Verification review | Juthoor',
};

export default async function AdminVerificationsPage() {
  const role = await getStaffRole();
  if (!role) notFound();
  const pending = await listPendingVerifications().catch(() => []);
  return (
    <AdminVerificationsClient
      initialPending={pending}
      isAdmin={role.isAdmin}
    />
  );
}
