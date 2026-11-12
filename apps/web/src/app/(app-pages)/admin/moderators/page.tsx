import { notFound } from 'next/navigation';

import { isCurrentUserAdmin } from '@/data/admin/requireAdmin';
import { listStaffProfiles } from '@/data/admin/moderators';
import { AdminModeratorsClient } from './AdminModeratorsClient';

export const metadata = {
  title: 'تعيين المشرفين — Moderators | Juthoor',
};

export default async function AdminModeratorsPage() {
  if (!(await isCurrentUserAdmin())) notFound();
  const staff = await listStaffProfiles().catch(() => []);
  return <AdminModeratorsClient initialStaff={staff} />;
}
