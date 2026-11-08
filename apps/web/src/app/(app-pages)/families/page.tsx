import { Suspense } from 'react';
import { loadTopSurnames } from '@/data/user/families-index';
import { loadAllPlaces } from '@/data/user/places';
import { FamiliesIndexClient } from './FamiliesIndexClient';
import { districtsFromPlaces } from '@/components/search/DistrictSelect';

type SearchParamsValue = string | string[] | undefined;

function firstString(v: SearchParamsValue): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

async function FamiliesContainer({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamsValue>>;
}) {
  const params = await searchParams;
  const district = firstString(params.district) ?? null;
  const [rows, places] = await Promise.all([
    loadTopSurnames(120, district),
    loadAllPlaces().catch(() => []),
  ]);
  const districts = districtsFromPlaces(places);
  return (
    <FamiliesIndexClient
      rows={rows}
      districts={districts}
      initialDistrict={district}
    />
  );
}

export default function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamsValue>>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center text-sm text-[var(--jt-stone-500)]">
          Loading families…
        </div>
      }
    >
      <FamiliesContainer searchParams={searchParams} />
    </Suspense>
  );
}
