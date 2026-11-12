import { notFound } from 'next/navigation';

import { isCurrentUserAdmin } from '@/data/admin/requireAdmin';
import { listEmailOutbox } from '@/data/admin/emailOutbox';

import { AdminEmailOutboxClient } from './AdminEmailOutboxClient';

export const metadata = {
  title: 'Email outbox — طابور البريد | Juthoor',
};

export default async function AdminEmailOutboxPage() {
  if (!(await isCurrentUserAdmin())) notFound();
  const rows = await listEmailOutbox().catch(() => []);
  return <AdminEmailOutboxClient initialRows={rows} />;
}
