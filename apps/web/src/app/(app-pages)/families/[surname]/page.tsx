import { Suspense } from 'react';
import { loadFamilyAcrossVillages } from '@/data/user/families-search';
import { loadFamilyGallery } from '@/data/user/archives';
import { FamilyClient } from './FamilyClient';

async function FamilyContainer({ surname }: { surname: string }) {
  const [overview, gallery] = await Promise.all([
    loadFamilyAcrossVillages(surname),
    loadFamilyGallery(surname),
  ]);
  return <FamilyClient overview={overview} gallery={gallery} />;
}

export default async function FamilyPage({
  params,
}: {
  params: Promise<{ surname: string }>;
}) {
  const { surname: encoded } = await params;
  const surname = decodeURIComponent(encoded);
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-[var(--jt-stone-500)]">
          Loading family…
        </div>
      }
    >
      <FamilyContainer surname={surname} />
    </Suspense>
  );
}
