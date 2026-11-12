'use server';

import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import { getCachedLoggedInUserIdOrNull } from '@/rsc-data/supabase';

export type PftLinkRow = {
  link_id: string;
  person_a_id: string;
  person_b_id: string;
  tree_a_id: string;
  tree_b_id: string;
  name_a_ar: string | null;
  name_a_en: string | null;
  name_b_ar: string | null;
  name_b_en: string | null;
  canonical_person_id: string;
  group_id: string;
};

export type PftIdentityGroup = {
  groupId: string;
  canonicalPersonId: string;
  links: PftLinkRow[];
  /** Distinct persons in this group that appear on accessible trees. */
  members: Array<{
    personId: string;
    treeId: string;
    nameAr: string | null;
    nameEn: string | null;
  }>;
};

/** Confirmed identity-link groups the current user participates in (PFT overlay). */
export async function listMyPftGroups(): Promise<PftIdentityGroup[]> {
  const uid = await getCachedLoggedInUserIdOrNull();
  if (!uid) return [];

  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase.rpc('list_visible_pft_links');
  if (error || !data) return [];

  const rows = data as PftLinkRow[];
  const byGroup = new Map<string, PftLinkRow[]>();
  for (const row of rows) {
    const key = row.group_id || row.canonical_person_id;
    const list = byGroup.get(key) ?? [];
    list.push(row);
    byGroup.set(key, list);
  }

  const groups: PftIdentityGroup[] = [];
  for (const [groupId, links] of byGroup) {
    const memberMap = new Map<
      string,
      { personId: string; treeId: string; nameAr: string | null; nameEn: string | null }
    >();
    for (const l of links) {
      memberMap.set(l.person_a_id, {
        personId: l.person_a_id,
        treeId: l.tree_a_id,
        nameAr: l.name_a_ar,
        nameEn: l.name_a_en,
      });
      memberMap.set(l.person_b_id, {
        personId: l.person_b_id,
        treeId: l.tree_b_id,
        nameAr: l.name_b_ar,
        nameEn: l.name_b_en,
      });
    }
    groups.push({
      groupId,
      canonicalPersonId: links[0]?.canonical_person_id ?? groupId,
      links,
      members: Array.from(memberMap.values()),
    });
  }

  groups.sort((a, b) => b.links.length - a.links.length);
  return groups;
}
