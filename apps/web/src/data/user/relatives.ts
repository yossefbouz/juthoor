'use server';

import { revalidatePath } from 'next/cache';

import { authActionClient } from '@/lib/safe-action';
import { addRelativeInputSchema } from '@/lib/tree/zodSchemas';
import { getTreeSnapshot } from '@/data/anon/treeSnapshot';
import { validateMarriage, validateNewSpouse } from '@/lib/tree/marriageRules';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import type { GenderType } from '@/types/database';

import { applyFatherInheritance } from '@/lib/tree/inheritance';

import {
  createPersonWithPrimaryName,
  loadFatherInheritanceDefaults,
  toUserFacingDbError,
  type SupabaseServerClient,
} from './personCreate';

/**
 * Create a person AND wire the family relationship in one server action.
 *
 * This replaces the old two-step dance (insert person → navigate with
 * query params that nothing consumed) which created floating, chart-
 * invisible persons. The flow is:
 *
 *   1. validate the anchor + plan the link (no writes yet)
 *   2. create the person via the atomic RPC
 *   3. execute the link plan (families / family_children writes)
 *   4. if linking fails → compensating delete of the new person, so the
 *      tree never accumulates invisible floating people
 *
 * FRS rules enforced here:
 *   - every child is linked to a mother; unknown mother → placeholder
 *     "Female N" auto-created and married to the father (FRS rule)
 *   - multi-spouse fathers: the mother must be one of his recorded
 *     partners, or explicitly a new placeholder
 */
export const addRelativeAction = authActionClient
  .schema(addRelativeInputSchema)
  .action(async ({ parsedInput }) => {
    const supabase = await createJuthoorSupabaseClient();
    const {
      anchorPersonId,
      kind,
      motherId,
      newPlaceholderMother,
      ...personInput
    } = parsedInput;
    const treeId = personInput.treeId;

    const anchor = await loadAnchorPerson(supabase, anchorPersonId, treeId);

    // Plan first: all validation errors fire BEFORE the person exists.
    const plan = await planLink(supabase, {
      treeId,
      anchor,
      kind,
      motherId: motherId ?? null,
      newPlaceholderMother: newPlaceholderMother ?? false,
      newPersonGender: personInput.gender,
    });

    // R4: default surname + origin from the father when the new person is
    // a child (or a sibling sharing that father's family). Explicit form
    // values always win over inheritance.
    const fatherIdForInheritance = await resolveFatherIdForInheritance(
      supabase,
      plan
    );
    const fatherDefaults = fatherIdForInheritance
      ? await loadFatherInheritanceDefaults(supabase, fatherIdForInheritance)
      : null;
    const personWithDefaults = applyFatherInheritance(
      personInput,
      fatherDefaults
    );

    const personId = await createPersonWithPrimaryName(
      supabase,
      personWithDefaults
    );

    try {
      await executeLink(supabase, {
        treeId,
        anchorId: anchor.id,
        personId,
        plan,
      });
    } catch (error) {
      // Roll back the person so no invisible floating node is left behind.
      await supabase.from('persons').delete().eq('id', personId);
      throw error;
    }

    revalidatePath('/tree');
    revalidatePath(`/tree/${treeId}`);
    return { personId };
  });

// ============================================================================
// Anchor loading
// ============================================================================



interface AnchorPerson {
  readonly id: string;
  readonly gender: string;
  readonly displayName: string;
}

async function loadAnchorPerson(
  supabase: SupabaseServerClient,
  anchorPersonId: string,
  treeId: string
): Promise<AnchorPerson> {
  const { data, error } = await supabase
    .from('persons')
    .select('id, gender, tree_id, display_name_ar, display_name_en')
    .eq('id', anchorPersonId)
    .maybeSingle();

  if (error) throw new Error(toUserFacingDbError(error.message));
  if (!data || data.tree_id !== treeId) {
    throw new Error('الشخص المرتبط غير موجود في هذه الشجرة.');
  }
  return {
    id: data.id,
    gender: data.gender,
    displayName: data.display_name_ar ?? data.display_name_en ?? 'شخص',
  };
}

// ============================================================================
// Link planning (pure reads — all user errors surface here, pre-create)
// ============================================================================

type LinkPlan =
  | { readonly kind: 'spouse' }
  | {
      readonly kind: 'parent';
      /** Existing family-of-origin to fill, or null → create new family. */
      readonly familyId: string | null;
      readonly slot: 'partner1_id' | 'partner2_id' | null;
    }
  | {
      readonly kind: 'child';
      /** Resolved co-parents. null father = single-mother family. */
      readonly fatherId: string | null;
      readonly motherId: string | null;
      readonly createPlaceholderMother: boolean;
    }
  | {
      readonly kind: 'sibling';
      /** Shared family-of-origin, or null → bootstrap placeholder father. */
      readonly familyId: string | null;
    };

async function resolveFatherIdForInheritance(
  supabase: SupabaseServerClient,
  plan: LinkPlan
): Promise<string | null> {
  if (plan.kind === 'child') {
    return plan.fatherId;
  }
  if (plan.kind === 'sibling' && plan.familyId) {
    const { data, error } = await supabase
      .from('families')
      .select('partner1_id, partner2_id')
      .eq('id', plan.familyId)
      .maybeSingle();
    if (error) throw new Error(toUserFacingDbError(error.message));
    if (!data) return null;
    const partnerIds = [data.partner1_id, data.partner2_id].filter(
      (id): id is string => Boolean(id)
    );
    if (partnerIds.length === 0) return null;
    const { data: partners, error: partnersErr } = await supabase
      .from('persons')
      .select('id, gender')
      .in('id', partnerIds);
    if (partnersErr) throw new Error(toUserFacingDbError(partnersErr.message));
    return partners?.find((p) => p.gender === 'M')?.id ?? null;
  }
  return null;
}

interface PlanArgs {
  readonly treeId: string;
  readonly anchor: AnchorPerson;
  readonly kind: 'child' | 'parent' | 'spouse' | 'sibling';
  readonly motherId: string | null;
  readonly newPlaceholderMother: boolean;
  /** Gender of the person being created — used to block same-gender co-parents. */
  readonly newPersonGender: 'M' | 'F';
}

async function planLink(
  supabase: SupabaseServerClient,
  args: PlanArgs
): Promise<LinkPlan> {
  switch (args.kind) {
    case 'spouse':
      return planSpouseLink(args);
    case 'parent':
      return planParentLink(supabase, args);
    case 'child':
      return planChildLink(supabase, args);
    case 'sibling':
      return planSiblingLink(supabase, args);
  }
}

/**
 * The new person becomes a spouse of the anchor. Enforces T&C Article 6:
 * opposite gender + the concurrent-spouse limits (a woman ≤ 1 husband, a man
 * ≤ 4 wives). Blood mahram cannot apply here — the spouse is brand new.
 */
async function planSpouseLink({
  treeId,
  anchor,
  newPersonGender,
}: PlanArgs): Promise<LinkPlan> {
  const snapshot = await getTreeSnapshot(treeId);
  const violation = validateNewSpouse({
    snapshot,
    anchorId: anchor.id,
    anchorGender: anchor.gender as GenderType,
    newGender: newPersonGender,
  });
  if (violation) throw new Error(violation.messageAr);
  return { kind: 'spouse' };
}

/** The new person becomes a parent of the anchor. */
async function planParentLink(
  supabase: SupabaseServerClient,
  { anchor, newPersonGender }: PlanArgs
): Promise<LinkPlan> {
  const families = await loadParentFamilies(supabase, anchor.id);

  if (families.length === 0) {
    return { kind: 'parent', familyId: null, slot: null };
  }

  const withEmptySlot = families.find(
    (f) => f.partner1_id === null || f.partner2_id === null
  );
  if (!withEmptySlot) {
    throw new Error(
      `كلا والدَي ${anchor.displayName} مسجّلان بالفعل. عدّل العائلة الحالية بدلًا من إضافة والد جديد.`
    );
  }

  // The empty slot's sibling holds the already-recorded parent. In the M/F
  // model a child has at most one father and one mother, so a second parent
  // must be the OPPOSITE gender. Without this guard, adding the same parent
  // twice produced "نسيمت married to نسيمت" (two same-gender co-parents).
  const existingParentId =
    withEmptySlot.partner1_id ?? withEmptySlot.partner2_id;
  if (existingParentId) {
    const existingGender = await loadPersonGender(supabase, existingParentId);
    if (existingGender === newPersonGender) {
      const role = newPersonGender === 'F' ? 'أمٌّ' : 'أبٌ';
      throw new Error(
        `لدى ${anchor.displayName} ${role} مسجّل بالفعل. لا يمكن إضافة والد آخر بالجنس نفسه — عدّل العائلة الحالية بدلًا من ذلك.`
      );
    }
  }

  return {
    kind: 'parent',
    familyId: withEmptySlot.id,
    slot: withEmptySlot.partner1_id === null ? 'partner1_id' : 'partner2_id',
  };
}

/** The new person becomes a child of the anchor. */
async function planChildLink(
  supabase: SupabaseServerClient,
  { treeId, anchor, motherId, newPlaceholderMother }: PlanArgs
): Promise<LinkPlan> {
  const partnerIds = await loadPartnerIds(supabase, treeId, anchor.id);

  if (anchor.gender === 'F') {
    // Anchor is the mother (FRS: mother link satisfied by definition).
    if (partnerIds.length > 1) {
      throw new Error(
        `${anchor.displayName} لديها أكثر من زوج مسجّل — أضِف الابن/الابنة من صفحة الأب لتحديد العائلة الصحيحة.`
      );
    }
    return {
      kind: 'child',
      fatherId: partnerIds[0] ?? null,
      motherId: anchor.id,
      createPlaceholderMother: false,
    };
  }

  // Anchor is the father — resolve the mother per FRS.
  if (newPlaceholderMother) {
    return {
      kind: 'child',
      fatherId: anchor.id,
      motherId: null,
      createPlaceholderMother: true,
    };
  }

  if (motherId) {
    // Multi-spouse rule: with recorded partners, the mother must be one.
    if (partnerIds.length > 0 && !partnerIds.includes(motherId)) {
      throw new Error(
        'الأم المحددة ليست من الزوجات المسجّلات لهذا الأب (قاعدة تعدد الزوجات).'
      );
    }
    await assertPersonInTree(supabase, motherId, treeId);
    // T&C Art 6: choosing an existing mother for a child records a father×mother
    // union — validate it (blood mahram + concurrent-spouse limits) before linking.
    const snapshot = await getTreeSnapshot(treeId);
    const mother = snapshot.persons.find((p) => p.id === motherId);
    const violation = validateMarriage({
      snapshot,
      aId: anchor.id,
      aGender: anchor.gender as GenderType,
      bId: motherId,
      bGender: mother?.gender ?? 'F',
    });
    if (violation) throw new Error(violation.messageAr);
    return {
      kind: 'child',
      fatherId: anchor.id,
      motherId,
      createPlaceholderMother: false,
    };
  }

  if (partnerIds.length === 1) {
    return {
      kind: 'child',
      fatherId: anchor.id,
      motherId: partnerIds[0],
      createPlaceholderMother: false,
    };
  }
  if (partnerIds.length === 0) {
    // FRS: unknown mother → system inserts placeholder "Female N".
    return {
      kind: 'child',
      fatherId: anchor.id,
      motherId: null,
      createPlaceholderMother: true,
    };
  }
  throw new Error(
    `${anchor.displayName} لديه أكثر من زوجة مسجّلة — حدّد الأم من القائمة.`
  );
}

/** The new person becomes a sibling of the anchor (shares family-of-origin). */
async function planSiblingLink(
  supabase: SupabaseServerClient,
  { anchor }: PlanArgs
): Promise<LinkPlan> {
  const families = await loadParentFamilies(supabase, anchor.id);
  return { kind: 'sibling', familyId: families[0]?.id ?? null };
}

// ============================================================================
// Link execution (writes)
// ============================================================================

interface ExecuteArgs {
  readonly treeId: string;
  readonly anchorId: string;
  readonly personId: string;
  readonly plan: LinkPlan;
}

async function executeLink(
  supabase: SupabaseServerClient,
  { treeId, anchorId, personId, plan }: ExecuteArgs
): Promise<void> {
  switch (plan.kind) {
    case 'spouse': {
      // If the anchor heads a single-parent family (children recorded,
      // partner missing — the chart shows it as a ghost card), fill the
      // empty slot so those children gain their second parent. Otherwise
      // record a new union.
      const halfEmpty = await findHalfEmptyFamily(supabase, treeId, anchorId);
      if (halfEmpty) {
        const { error } = await supabase
          .from('families')
          .update({ [halfEmpty.emptySlot]: personId })
          .eq('id', halfEmpty.id);
        if (error) throw new Error(toUserFacingDbError(error.message));
        return;
      }
      await insertFamily(supabase, treeId, anchorId, personId);
      return;
    }
    case 'parent': {
      if (plan.familyId && plan.slot) {
        const { error } = await supabase
          .from('families')
          .update({ [plan.slot]: personId })
          .eq('id', plan.familyId);
        if (error) throw new Error(toUserFacingDbError(error.message));
        return;
      }
      const familyId = await insertFamily(supabase, treeId, personId, null);
      await insertChildLink(supabase, familyId, anchorId);
      return;
    }
    case 'child': {
      const motherId = plan.createPlaceholderMother
        ? await createPlaceholderMother(supabase, treeId, plan.fatherId)
        : plan.motherId;
      const familyId = await findOrCreateFamily(
        supabase,
        treeId,
        plan.fatherId,
        motherId
      );
      await insertChildLink(supabase, familyId, personId);
      return;
    }
    case 'sibling': {
      if (plan.familyId) {
        await insertChildLink(supabase, plan.familyId, personId);
        return;
      }
      // No known parents: bootstrap a placeholder father so siblinghood
      // is derivable (shared parent), mirroring the Female-N convention.
      const fatherId = await createPlaceholderFather(supabase, treeId);
      const familyId = await insertFamily(supabase, treeId, fatherId, null);
      await insertChildLink(supabase, familyId, anchorId);
      await insertChildLink(supabase, familyId, personId);
      return;
    }
  }
}

// ============================================================================
// Family helpers
// ============================================================================

interface FamilyRow {
  readonly id: string;
  readonly partner1_id: string | null;
  readonly partner2_id: string | null;
}

/** Families in which `personId` is recorded as a child. */
async function loadParentFamilies(
  supabase: SupabaseServerClient,
  personId: string
): Promise<readonly FamilyRow[]> {
  const { data: links, error: linksErr } = await supabase
    .from('family_children')
    .select('family_id, created_at')
    .eq('child_id', personId)
    .order('created_at', { ascending: true });
  if (linksErr) throw new Error(toUserFacingDbError(linksErr.message));

  const familyIds = (links ?? []).map((l) => l.family_id);
  if (familyIds.length === 0) return [];

  const { data: fams, error: famsErr } = await supabase
    .from('families')
    .select('id, partner1_id, partner2_id')
    .in('id', familyIds);
  if (famsErr) throw new Error(toUserFacingDbError(famsErr.message));

  // Preserve the child-link order (oldest link first).
  const byId = new Map((fams ?? []).map((f) => [f.id, f]));
  return familyIds
    .map((id) => byId.get(id))
    .filter((f): f is FamilyRow => Boolean(f));
}

/** Partner ids recorded for a person across all their families. */
async function loadPartnerIds(
  supabase: SupabaseServerClient,
  treeId: string,
  personId: string
): Promise<readonly string[]> {
  const { data, error } = await supabase
    .from('families')
    .select('partner1_id, partner2_id')
    .eq('tree_id', treeId)
    .or(`partner1_id.eq.${personId},partner2_id.eq.${personId}`);
  if (error) throw new Error(toUserFacingDbError(error.message));

  return (data ?? [])
    .map((f) => (f.partner1_id === personId ? f.partner2_id : f.partner1_id))
    .filter((id): id is string => Boolean(id));
}

async function loadPersonGender(
  supabase: SupabaseServerClient,
  personId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('persons')
    .select('gender')
    .eq('id', personId)
    .maybeSingle();
  if (error) throw new Error(toUserFacingDbError(error.message));
  return data?.gender ?? null;
}

async function assertPersonInTree(
  supabase: SupabaseServerClient,
  personId: string,
  treeId: string
): Promise<void> {
  const { data, error } = await supabase
    .from('persons')
    .select('id, tree_id')
    .eq('id', personId)
    .maybeSingle();
  if (error) throw new Error(toUserFacingDbError(error.message));
  if (!data || data.tree_id !== treeId) {
    throw new Error('الشخص المحدد غير موجود في هذه الشجرة.');
  }
}

/**
 * First family where `personId` is the only recorded partner, oldest
 * first — the natural target when the missing spouse gets recorded.
 */
async function findHalfEmptyFamily(
  supabase: SupabaseServerClient,
  treeId: string,
  personId: string
): Promise<{ id: string; emptySlot: 'partner1_id' | 'partner2_id' } | null> {
  const { data, error } = await supabase
    .from('families')
    .select('id, partner1_id, partner2_id')
    .eq('tree_id', treeId)
    .or(
      `and(partner1_id.eq.${personId},partner2_id.is.null),and(partner2_id.eq.${personId},partner1_id.is.null)`
    )
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw new Error(toUserFacingDbError(error.message));
  const fam = data?.[0];
  if (!fam) return null;
  return {
    id: fam.id,
    emptySlot: fam.partner1_id === null ? 'partner1_id' : 'partner2_id',
  };
}

async function insertFamily(
  supabase: SupabaseServerClient,
  treeId: string,
  partner1Id: string | null,
  partner2Id: string | null
): Promise<string> {
  const { data, error } = await supabase
    .from('families')
    .insert({
      tree_id: treeId,
      partner1_id: partner1Id,
      partner2_id: partner2Id,
    })
    .select('id')
    .single();
  if (error) throw new Error(toUserFacingDbError(error.message));
  return data.id;
}

async function findOrCreateFamily(
  supabase: SupabaseServerClient,
  treeId: string,
  partnerA: string | null,
  partnerB: string | null
): Promise<string> {
  if (!partnerA && !partnerB) {
    throw new Error('لا يمكن إنشاء عائلة بدون أي من الوالدين.');
  }

  // Single-parent family: reuse an existing one for the same parent.
  if (!partnerA || !partnerB) {
    const solo = (partnerA ?? partnerB) as string;
    const { data, error } = await supabase
      .from('families')
      .select('id, partner1_id, partner2_id')
      .eq('tree_id', treeId)
      .or(
        `and(partner1_id.eq.${solo},partner2_id.is.null),and(partner2_id.eq.${solo},partner1_id.is.null)`
      )
      .limit(1);
    if (error) throw new Error(toUserFacingDbError(error.message));
    if (data && data.length > 0) return data[0].id;
    return insertFamily(supabase, treeId, solo, null);
  }

  const { data, error } = await supabase
    .from('families')
    .select('id')
    .eq('tree_id', treeId)
    .or(
      `and(partner1_id.eq.${partnerA},partner2_id.eq.${partnerB}),and(partner1_id.eq.${partnerB},partner2_id.eq.${partnerA})`
    )
    .limit(1);
  if (error) throw new Error(toUserFacingDbError(error.message));
  if (data && data.length > 0) return data[0].id;
  return insertFamily(supabase, treeId, partnerA, partnerB);
}

async function insertChildLink(
  supabase: SupabaseServerClient,
  familyId: string,
  childId: string
): Promise<void> {
  const { error } = await supabase.from('family_children').insert({
    family_id: familyId,
    child_id: childId,
    pedigree: 'birth',
  });
  if (error) throw new Error(toUserFacingDbError(error.message));
}

// ============================================================================
// Placeholder creation (FRS "Female N" convention + male mirror)
// ============================================================================

/**
 * Create a placeholder "Female N" mother and marry her to the father.
 * N is scoped per-father (2026-04-17 decision). Returns the placeholder
 * person id; the family (father × placeholder) is created as a side
 * effect so the caller can immediately find-or-create against it.
 */
async function createPlaceholderMother(
  supabase: SupabaseServerClient,
  treeId: string,
  fatherId: string | null
): Promise<string> {
  if (!fatherId) {
    throw new Error('لا يمكن إنشاء أم مؤقتة بدون أب معروف.');
  }

  const partnerIds = await loadPartnerIds(supabase, treeId, fatherId);
  const placeholderCount = await countPlaceholders(supabase, partnerIds);
  const n = placeholderCount + 1;

  const placeholderId = await createPersonWithPrimaryName(
    supabase,
    {
      treeId,
      gender: 'F',
      enGivenName: `Female ${n}`,
      arGivenName: `أنثى ${n}`,
    },
    { isPlaceholder: true }
  );

  await insertFamily(supabase, treeId, fatherId, placeholderId);
  return placeholderId;
}

/** Mirror of Female-N for unknown fathers (sibling bootstrap). Tree-scoped N. */
async function createPlaceholderFather(
  supabase: SupabaseServerClient,
  treeId: string
): Promise<string> {
  const { count, error } = await supabase
    .from('persons')
    .select('id', { count: 'exact', head: true })
    .eq('tree_id', treeId)
    .eq('gender', 'M')
    .eq('notes', 'placeholder');
  if (error) throw new Error(toUserFacingDbError(error.message));
  const n = (count ?? 0) + 1;

  return createPersonWithPrimaryName(
    supabase,
    {
      treeId,
      gender: 'M',
      enGivenName: `Male ${n}`,
      arGivenName: `ذكر ${n}`,
    },
    { isPlaceholder: true }
  );
}

async function countPlaceholders(
  supabase: SupabaseServerClient,
  personIds: readonly string[]
): Promise<number> {
  if (personIds.length === 0) return 0;
  const { data, error } = await supabase
    .from('persons')
    .select('id, notes')
    .in('id', personIds as string[]);
  if (error) throw new Error(toUserFacingDbError(error.message));
  return (data ?? []).filter((p) => p.notes === 'placeholder').length;
}
