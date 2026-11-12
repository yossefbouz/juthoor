import { notFound } from 'next/navigation';

import { getStaffRole } from '@/data/admin/requireStaff';
import { listOpenAppeals } from '@/data/admin/appeals';
import { AdminAppealsClient } from './AdminAppealsClient';

export const metadata = {
  title: 'استئنافات التوثيق — Verification appeals | Juthoor',
};

export default async function AdminAppealsPage() {
  const role = await getStaffRole();
  if (!role) notFound();
  const appeals = await listOpenAppeals().catch(() => []);
  return <AdminAppealsClient initialAppeals={appeals} isAdmin={role.isAdmin} />;
}
