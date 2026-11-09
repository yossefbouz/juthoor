import { Suspense } from 'react';
import { loadTopSurnames } from '@/data/user/families-index';
import { loadAllPlaces } from '@/data/user/places';
import { FamiliesIndexClient } from './FamiliesIndexClient';
import { districtsFromPlaces } from '@/lib/places/districts';

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
  const q = (firstString(params.q) ?? '').trim() || null;
  const districtRaw = firstString(params.district) ?? null;
  const district = districtRaw ? districtRaw.trim().toLowerCase() : null;
  const placeId = (firstString(params.placeId) ?? '').trim() || null;

  const hasFilters = Boolean(q || district || placeId);
  const [rows, places] = await Promise.all([
    loadTopSurnames(hasFilters ? 400 : 120, { surname: q, district, placeId }),
    loadAllPlaces().catch(() => []),
  ]);
  const districts = districtsFromPlaces(places);
  return (
    <FamiliesIndexClient
      rows={rows}
      places={places}
      districts={districts}
      initialQ={q}
      initialDistrict={district}
      initialPlaceId={placeId}
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
