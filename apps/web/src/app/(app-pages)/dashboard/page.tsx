import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { DashboardClient, type DashboardData } from './DashboardClient';
import { DashboardSkeleton } from './DashboardSkeleton';
import { ensureUserHasDefaultTree } from '@/data/anon/trees';
import { getViewerTreeSnapshot } from '@/data/anon/treeSnapshot';
import { getStaffRole } from '@/data/admin/requireStaff';
import { getMyVerification } from '@/data/user/identityVerification';
import { isTourDoneInMetadata } from '@/lib/tour/tourState';
import { getCachedLoggedInVerifiedSupabaseUser } from '@/rsc-data/supabase';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';

async function loadDashboard(): Promise<DashboardData> {
  let treeId: string | null;
  try {
    treeId = await ensureUserHasDefaultTree();
  } catch {
    redirect('/login');
  }
  if (!treeId) redirect('/login');

  const supabase = await createJuthoorSupabaseClient();

  const [
    treeRes,
    personsCountRes,
    personsRecentRes,
    villagesDiscoverRes,
    userOriginsRes,
    snapshot,
    verification,
    staffRole,
    auth,
  ] = await Promise.all([
    supabase.from('trees').select('id, name, created_at').eq('id', treeId).maybeSingle(),
    supabase.from('persons').select('id', { count: 'exact', head: true }).eq('tree_id', treeId),
    supabase
      .from('persons')
      .select('id, display_name_ar, display_name_en, gender, created_at')
      .eq('tree_id', treeId)
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('places')
      .select('id, name_ar, name_en, district_ar, district_en, depopulated_year')
      .not('depopulated_year', 'is', null)
      .limit(9),
    supabase
      .from('events')
      .select('place_id, persons!inner(tree_id)')
      .eq('persons.tree_id', treeId)
      .not('place_id', 'is', null),
    getViewerTreeSnapshot(treeId).catch(() => null),
    getMyVerification().catch(() => null),
    getStaffRole().catch(() => null),
    getCachedLoggedInVerifiedSupabaseUser().catch(() => null),
  ]);

  const needsVerification = !(verification && verification.status === 'approved');

  return {
    treeId,
    treeName: treeRes.data?.name ?? 'شجرة عائلتي',
    personsCount: personsCountRes.count ?? 0,
    recentPersons: (personsRecentRes.data ?? []) as DashboardData['recentPersons'],
    villagesDiscover: (villagesDiscoverRes.data ?? []) as DashboardData['villagesDiscover'],
    userOrigins: (userOriginsRes.data ?? []) as unknown as DashboardData['userOrigins'],
    snapshot,
    needsVerification,
    verificationStatus: verification?.status ?? null,
    staff: staffRole
      ? { isAdmin: staffRole.isAdmin }
      : null,
    tour: auth?.user
      ? { userId: auth.user.id, done: isTourDoneInMetadata(auth.user.user_metadata) }
      : null,
  };
}

async function DashboardShell() {
  const data = await loadDashboard();
  return <DashboardClient data={data} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardShell />
    </Suspense>
  );
}