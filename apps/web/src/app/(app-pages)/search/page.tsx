import { Suspense } from 'react';
import { SearchClient } from './SearchClient';
import { loadVillagesForFilter, searchMasterTree } from '@/data/user/search';
import { computeDegreesTo, getSelfPersonId, type DegreesResult } from '@/data/user/degrees';
import { SearchQuerySchema, type SearchResult } from '@/lib/search/zodSchemas';
import { placeMatchesDistrict } from '@/lib/places/districts';

type SearchParamsValue = string | string[] | undefined;

function firstString(v: SearchParamsValue): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

async function runSearch(params: Record<string, SearchParamsValue>): Promise<{
  results: SearchResult[];
  hasQuery: boolean;
  error: string | null;
}> {
  const q = firstString(params.q);
  const given = firstString(params.given);
  const surname = firstString(params.surname);
  const father = firstString(params.father);
  const mother = firstString(params.mother);
  const paternalGrandfather = firstString(params.paternalGrandfather);
  const paternalGreatGrandfather = firstString(params.paternalGreatGrandfather);
  const placeId = firstString(params.placeId);
  const district = firstString(params.district);
  const birthYear = firstString(params.birthYear);
  const yearWindow = firstString(params.yearWindow);
  const gender = firstString(params.gender);

  const hasQuery = Boolean(
    q ||
      given ||
      surname ||
      father ||
      mother ||
      paternalGrandfather ||
      paternalGreatGrandfather ||
      placeId ||
      district ||
      birthYear,
  );
  if (!hasQuery) return { results: [], hasQuery: false, error: null };

  const parsed = SearchQuerySchema.safeParse({
    q,
    given,
    surname,
    father,
    mother,
    paternalGrandfather,
    paternalGreatGrandfather,
    placeId,
    district,
    birthYear,
    yearWindow,
    gender,
  });
  if (!parsed.success) {
    return { results: [], hasQuery: true, error: parsed.error.issues[0]?.message ?? 'Invalid query' };
  }
  try {
    let results = await searchMasterTree(parsed.data);
    if (district && !placeId) {
      const villages = await loadVillagesForFilter();
      const allowed = new Set(
        villages
          .filter((v) => placeMatchesDistrict(v, district.toLowerCase()))
          .map((v) => v.id),
      );
      results = results.filter(
        (r) => r.origin_place_id != null && allowed.has(r.origin_place_id),
      );
    }
    return { results, hasQuery: true, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    return { results: [], hasQuery: true, error: message };
  }
}

async function SearchContainer({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamsValue>>;
}) {
  const params = await searchParams;
  const [{ results, hasQuery, error }, villages, selfPersonId] = await Promise.all([
    runSearch(params),
    loadVillagesForFilter().catch(() => []),
    getSelfPersonId().catch(() => null),
  ]);

  // Compute degrees for each result in parallel (cache-backed, cheap).
  // Degrees to self are skipped client-side anyway.
  const degreesByPersonId: Record<string, DegreesResult> = {};
  if (selfPersonId) {
    const pairs = await Promise.all(
      results.map(async (r) => {
        if (r.person_id === selfPersonId) return [r.person_id, null] as const;
        try {
          return [r.person_id, await computeDegreesTo(r.person_id)] as const;
        } catch {
          return [r.person_id, null] as const;
        }
      }),
    );
    for (const [pid, deg] of pairs) {
      degreesByPersonId[pid] = deg;
    }
  }

  return (
    <SearchClient
      initialResults={results}
      degreesByPersonId={degreesByPersonId}
      selfPersonId={selfPersonId}
      initialQuery={{
        q: firstString(params.q) ?? '',
        given: firstString(params.given) ?? '',
        surname: firstString(params.surname) ?? '',
        father: firstString(params.father) ?? '',
        mother: firstString(params.mother) ?? '',
        paternalGrandfather: firstString(params.paternalGrandfather) ?? '',
        paternalGreatGrandfather: firstString(params.paternalGreatGrandfather) ?? '',
        placeId: firstString(params.placeId) ?? null,
        district: firstString(params.district) ?? null,
        birthYear: firstString(params.birthYear) ?? '',
        yearWindow: Number(firstString(params.yearWindow) ?? 5),
        gender: (firstString(params.gender) as 'M' | 'F' | undefined) ?? null,
      }}
      villages={villages}
      hasQuery={hasQuery}
      serverError={error}
    />
  );
}

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamsValue>>;
}) {
  return (
    <Suspense
      fallback={
        <SearchClient
          initialResults={[]}
          degreesByPersonId={{}}
          selfPersonId={null}
          initialQuery={{ q: '', given: '', surname: '', father: '', mother: '', paternalGrandfather: '', paternalGreatGrandfather: '', placeId: null, district: null, birthYear: '', yearWindow: 5, gender: null }}
          villages={[]}
          hasQuery={false}
          serverError={null}
        />
      }
    >
      <SearchContainer searchParams={searchParams} />
    </Suspense>
  );
}
