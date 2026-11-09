import { Suspense } from 'react';
import { loadFamilyAcrossVillages } from '@/data/user/families-search';
import { loadFamilyGallery } from '@/data/user/archives';
import { FamilyClient } from './FamilyClient';

type SearchParamsValue = string | string[] | undefined;

function firstString(v: SearchParamsValue): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

async function FamilyContainer({
  surname,
  searchParams,
}: {
  surname: string;
  searchParams: Promise<Record<string, SearchParamsValue>>;
}) {
  const params = await searchParams;
  const districtRaw = firstString(params.district) ?? null;
  const district = districtRaw ? districtRaw.trim().toLowerCase() : null;
  const placeId = (firstString(params.placeId) ?? '').trim() || null;

  const [overview, gallery] = await Promise.all([
    loadFamilyAcrossVillages(surname, { district, placeId }),
    loadFamilyGallery(surname),
  ]);
  return (
    <FamilyClient
      overview={overview}
      gallery={gallery}
      filters={{ district, placeId }}
    />
  );
}

export default async function FamilyPage({
  params,
  searchParams,
}: {
  params: Promise<{ surname: string }>;
  searchParams: Promise<Record<string, SearchParamsValue>>;
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
      <FamilyContainer surname={surname} searchParams={searchParams} />
    </Suspense>
  );
}
