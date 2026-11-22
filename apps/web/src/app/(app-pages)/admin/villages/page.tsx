import { notFound } from 'next/navigation';

import { isCurrentUserAdmin } from '@/data/admin/requireAdmin';
import { listAdminPlaces } from '@/data/admin/villages';
import { AdminVillagesClient } from './AdminVillagesClient';

export const metadata = {
  title: 'القرى والمدن — Villages admin | Juthoor',
};

export default async function AdminVillagesPage() {
  if (!(await isCurrentUserAdmin())) notFound();
  const places = await listAdminPlaces().catch(() => []);
  return <AdminVillagesClient initialPlaces={places} />;
}
