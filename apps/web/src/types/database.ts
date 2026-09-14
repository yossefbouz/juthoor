/**
 * Juthoor Database Types — GEDCOM 7 Aligned
 *
 * Two sections:
 *
 *   1) Exported domain interfaces (Person, Family, etc.) — convenient
 *      shapes for application code. Fields are readonly because domain
 *      objects are treated as immutable.
 *
 *   2) The Supabase-compatible `Database` type — follows the exact
 *      shape produced by `supabase gen types typescript`. This is the
 *      type we parameterise `createServerClient<Database>` with; it
 *      MUST use mutable Row/Insert/Update shapes so Postgrest's
 *      generic inference works.
 *
 * To regenerate when the schema changes:
 *   npx supabase gen types typescript --project-id nlufpicjdeeqcgepewdg \
 *     --schema public > apps/web/src/types/database.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ============================================================================
// Enums
// ============================================================================

export type GenderType = 'M' | 'F' | 'X' | 'U';

export type EventType =
  | 'BIRT' | 'DEAT' | 'BURI' | 'BAPM' | 'CHR'
  | 'EMIG' | 'IMMI' | 'NATU' | 'CENS' | 'RESI' | 'EVEN'
  | 'MARR' | 'DIV' | 'ANUL' | 'ENGA' | 'MARS' | 'MARL'
  | 'MARB' | 'MARC' | 'DIVF' | 'SEPA';

export type NameType = 'birth' | 'married' | 'immigrant' | 'aka' | 'professional' | 'maiden';

export type PedigreeType = 'birth' | 'adopted' | 'foster' | 'sealing' | 'other';

export type MatchStatus = 'pending' | 'auto_merged' | 'admin_approved' | 'admin_rejected' | 'deferred';

export type TreeRole = 'owner' | 'collaborator' | 'read_only';

export type TreeMemberStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export type AttachmentKind = 'photo' | 'document';

export type AttachmentTag =
  | 'portrait'
  | 'id_card'
  | 'passport'
  | 'birth_cert'
  | 'death_cert'
  | 'marriage_cert'
  | 'land_deed'
  | 'family_card'
  | 'letter'
  | 'old_photo'
  | 'other';

// ============================================================================
// Domain-level interfaces (readonly — for application reads)
// ============================================================================

export interface Place {
  readonly id: string;
  readonly name_ar: string;
  readonly name_en: string | null;
  readonly place_type: string;
  readonly district_ar: string | null;
  readonly district_en: string | null;
  readonly country: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly depopulated_year: number | null;
  readonly is_depopulated: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Tree {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly owner_id: string;
  readonly is_public: boolean;
  readonly gedcom_filename: string | null;
  readonly gedcom_imported_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface TreeMember {
  readonly id: string;
  readonly tree_id: string;
  readonly user_id: string;
  readonly role: TreeRole;
  readonly invited_at: string;
  readonly accepted_at: string | null;
}

export interface Person {
  readonly id: string;
  readonly tree_id: string;
  readonly gender: GenderType;
  readonly display_name_ar: string | null;
  readonly display_name_en: string | null;
  readonly gedcom_xref: string | null;
  readonly is_living: boolean;
  readonly notes: string | null;
  readonly created_by: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface PersonName {
  readonly id: string;
  readonly person_id: string;
  readonly name_type: NameType;
  readonly is_primary: boolean;
  readonly lang: string;
  readonly prefix: string | null;
  readonly given_name: string | null;
  readonly nickname: string | null;
  readonly surname_prefix: string | null;
  readonly surname: string | null;
  readonly suffix: string | null;
  readonly gedcom_name: string | null;
  readonly created_at: string;
}

export interface Family {
  readonly id: string;
  readonly tree_id: string;
  readonly partner1_id: string | null;
  readonly partner2_id: string | null;
  readonly gedcom_xref: string | null;
  readonly notes: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface FamilyChild {
  readonly id: string;
  readonly family_id: string;
  readonly child_id: string;
  readonly pedigree: PedigreeType;
  readonly birth_order: number | null;
  readonly created_at: string;
}

export interface Event {
  readonly id: string;
  readonly person_id: string | null;
  readonly family_id: string | null;
  readonly event_type: EventType;
  readonly date_value: string | null;
  readonly date_sort: number | null;
  readonly date_year: number | null;
  readonly place_id: string | null;
  readonly place_name: string | null;
  readonly description: string | null;
  readonly cause: string | null;
  readonly notes: string | null;
  readonly created_at: string;
}

export interface Match {
  readonly id: string;
  readonly person_a_id: string;
  readonly person_b_id: string;
  readonly confidence_score: number;
  readonly status: MatchStatus;
  readonly found_by: string;
  readonly reviewed_by: string | null;
  readonly reviewed_at: string | null;
  readonly score_breakdown: Json | null;
  readonly notes: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface Profile {
  readonly id: string;
  readonly display_name: string | null;
  readonly display_name_ar: string | null;
  readonly avatar_url: string | null;
  readonly preferred_language: 'ar' | 'en';
  readonly is_admin: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

// ============================================================================
// Supabase-compatible Database type (mutable — required by Postgrest generics)
// ============================================================================

/** Non-readonly shape used by Supabase generics. */
type MutablePlace = {
  id: string;
  name_ar: string;
  name_en: string | null;
  place_type: string;
  district_ar: string | null;
  district_en: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  depopulated_year: number | null;
  is_depopulated: boolean;
  created_at: string;
  updated_at: string;
};

/** Editorial enrichment for a place (Villages/Cities/Clans page). 1:1 with `places`.
 *  Kept in a separate table so the core `places` queries (and the dashboard that
 *  reads them) are never affected by enrichment changes. */
export type PlaceExternalLink = {
  label_ar: string | null;
  label_en: string | null;
  url: string;
};

type MutablePlaceProfile = {
  place_id: string;
  historical_overview_ar: string | null;
  historical_overview_en: string | null;
  what_remains_ar: string | null;
  what_remains_en: string | null;
  population_year: number | null;
  population_count: number | null;
  source_attribution_ar: string | null;
  source_attribution_en: string | null;
  external_links: PlaceExternalLink[] | null;
  gallery: unknown[] | null;
  documents: unknown[] | null;
  updated_at: string;
  updated_by: string | null;
};

/** Per-person narrative (achievements, contribution to the cause) for the 360
 *  view. 1:1 with `persons`, kept separate so core persons queries are unaffected. */
type MutablePersonProfile = {
  person_id: string;
  achievements_ar: string | null;
  achievements_en: string | null;
  contribution_ar: string | null;
  contribution_en: string | null;
  updated_at: string;
  updated_by: string | null;
};

/** Gov-ID + family-evidence verification request (mockup 02 / flow 1.1). */
type MutableIdentityVerification = {
  id: string;
  user_id: string;
  tree_id: string | null;
  id_document_path: string;
  id_document_type: 'passport' | 'national_id' | 'refugee_card' | 'other';
  family_evidence_path: string | null;
  family_evidence_note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type MutableTree = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  is_public: boolean;
  gedcom_filename: string | null;
  gedcom_imported_at: string | null;
  created_at: string;
  updated_at: string;
};

type MutableTreeMember = {
  id: string;
  tree_id: string;
  user_id: string;
  role: TreeRole;
  status: TreeMemberStatus;
  invited_at: string;
  accepted_at: string | null;
  requested_at: string;
  requested_role: TreeRole | null;
  requester_note: string | null;
  proof_url: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  rejection_reason: string | null;
};

type MutablePerson = {
  id: string;
  tree_id: string;
  gender: GenderType;
  display_name_ar: string | null;
  display_name_en: string | null;
  gedcom_xref: string | null;
  is_living: boolean;
  notes: string | null;
  primary_photo_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type MutablePersonAttachment = {
  id: string;
  person_id: string;
  kind: AttachmentKind;
  tag: AttachmentTag;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  caption_ar: string | null;
  caption_en: string | null;
  year: number | null;
  uploaded_by: string | null;
  created_at: string;
};

type MutableMatchPath = {
  source_person_id: string;
  target_person_id: string;
  degrees: number;
  path_json: Json;
  computed_at: string;
};

type MutablePersonName = {
  id: string;
  person_id: string;
  name_type: NameType;
  is_primary: boolean;
  lang: string;
  prefix: string | null;
  given_name: string | null;
  nickname: string | null;
  surname_prefix: string | null;
  surname: string | null;
  suffix: string | null;
  gedcom_name: string | null;
  created_at: string;
};

type MutableFamily = {
  id: string;
  tree_id: string;
  partner1_id: string | null;
  partner2_id: string | null;
  gedcom_xref: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type MutableFamilyChild = {
  id: string;
  family_id: string;
  child_id: string;
  pedigree: PedigreeType;
  birth_order: number | null;
  created_at: string;
};

type MutableEvent = {
  id: string;
  person_id: string | null;
  family_id: string | null;
  event_type: EventType;
  date_value: string | null;
  date_sort: number | null;
  date_year: number | null;
  place_id: string | null;
  place_name: string | null;
  description: string | null;
  cause: string | null;
  notes: string | null;
  created_at: string;
};

type MutableMatch = {
  id: string;
  person_a_id: string;
  person_b_id: string;
  confidence_score: number;
  status: MatchStatus;
  found_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  score_breakdown: Json | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type MutableProfile = {
  id: string;
  display_name: string | null;
  display_name_ar: string | null;
  avatar_url: string | null;
  preferred_language: 'ar' | 'en';
  is_admin: boolean;
  self_person_id: string | null;
  created_at: string;
  updated_at: string;
};

// ── Matching engine M3 (owner-facing) ────────────────────────────────────────
export type HintStatus = 'pending' | 'accepted' | 'rejected';

type MutableMatchHint = {
  id: string;
  match_id: string;
  owner_user_id: string;
  counterpart_person_id: string;
  status: HintStatus;
  created_at: string;
  updated_at: string;
};

type MutablePersonPrivacyHold = {
  person_id: string;
  set_by: string | null;
  set_at: string;
  reason: string | null;
};

type MutableNotification = {
  id: string;
  recipient_user_id: string;
  kind: string;
  match_id: string | null;
  person_link_id: string | null;
  title_ar: string | null;
  title_en: string | null;
  body_ar: string | null;
  body_en: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

/** Row of the masked, SECURITY DEFINER match_review_cards view (owner/admin). */
export type MatchReviewCardRow = {
  match_id: string;
  confidence_score: number;
  status: MatchStatus;
  created_at: string;
  updated_at: string;
  viewer_person_id: string;
  viewer_name_ar: string | null;
  viewer_name_en: string | null;
  counterpart_person_id: string;
  counterpart_is_living: boolean;
  living_involved: boolean;
  counterpart_revealed: boolean;
  counterpart_masked: boolean;
  counterpart_initials: string | null;
  counterpart_district_ar: string | null;
  counterpart_district_en: string | null;
  counterpart_decade: number | null;
  counterpart_label_ar: string;
  counterpart_label_en: string;
  field_agreement: Json | null;
};

export type Database = {
  public: {
    Tables: {
      places: {
        Row: MutablePlace;
        Insert: Partial<MutablePlace> & { id?: string; name_ar: string };
        Update: Partial<MutablePlace>;
        Relationships: [];
      };
      place_profiles: {
        Row: MutablePlaceProfile;
        Insert: Partial<MutablePlaceProfile> & { place_id: string };
        Update: Partial<MutablePlaceProfile>;
        Relationships: [];
      };
      person_profiles: {
        Row: MutablePersonProfile;
        Insert: Partial<MutablePersonProfile> & { person_id: string };
        Update: Partial<MutablePersonProfile>;
        Relationships: [];
      };
      identity_verifications: {
        Row: MutableIdentityVerification;
        Insert: Partial<MutableIdentityVerification> & {
          user_id: string;
          id_document_path: string;
          id_document_type: MutableIdentityVerification['id_document_type'];
        };
        Update: Partial<MutableIdentityVerification>;
        Relationships: [];
      };
      trees: {
        Row: MutableTree;
        Insert: Partial<MutableTree> & { name: string; owner_id: string };
        Update: Partial<MutableTree>;
        Relationships: [];
      };
      tree_members: {
        Row: MutableTreeMember;
        Insert: Partial<MutableTreeMember> & {
          tree_id: string;
          user_id: string;
        };
        Update: Partial<MutableTreeMember>;
        Relationships: [];
      };
      persons: {
        Row: MutablePerson;
        Insert: Partial<MutablePerson> & { tree_id: string };
        Update: Partial<MutablePerson>;
        Relationships: [];
      };
      person_names: {
        Row: MutablePersonName;
        Insert: Partial<MutablePersonName> & { person_id: string };
        Update: Partial<MutablePersonName>;
        Relationships: [];
      };
      families: {
        Row: MutableFamily;
        Insert: Partial<MutableFamily> & { tree_id: string };
        Update: Partial<MutableFamily>;
        Relationships: [];
      };
      family_children: {
        Row: MutableFamilyChild;
        Insert: Partial<MutableFamilyChild> & {
          family_id: string;
          child_id: string;
        };
        Update: Partial<MutableFamilyChild>;
        Relationships: [];
      };
      events: {
        Row: MutableEvent;
        Insert: Partial<MutableEvent> & { event_type: EventType };
        Update: Partial<MutableEvent>;
        Relationships: [];
      };
      matches: {
        Row: MutableMatch;
        Insert: Partial<MutableMatch> & {
          person_a_id: string;
          person_b_id: string;
          confidence_score: number;
        };
        Update: Partial<MutableMatch>;
        Relationships: [];
      };
      profiles: {
        Row: MutableProfile;
        Insert: Partial<MutableProfile> & { id: string };
        Update: Partial<MutableProfile>;
        Relationships: [];
      };
      person_attachments: {
        Row: MutablePersonAttachment;
        Insert: Partial<MutablePersonAttachment> & {
          person_id: string;
          kind: AttachmentKind;
          mime_type: string;
          size_bytes: number;
          storage_path: string;
        };
        Update: Partial<MutablePersonAttachment>;
        Relationships: [];
      };
      match_paths: {
        Row: MutableMatchPath;
        Insert: Partial<MutableMatchPath> & {
          source_person_id: string;
          target_person_id: string;
          degrees: number;
          path_json: Json;
        };
        Update: Partial<MutableMatchPath>;
        Relationships: [];
      };
      match_hints: {
        Row: MutableMatchHint;
        Insert: Partial<MutableMatchHint> & {
          match_id: string;
          owner_user_id: string;
          counterpart_person_id: string;
        };
        Update: Partial<MutableMatchHint>;
        Relationships: [];
      };
      person_privacy_holds: {
        Row: MutablePersonPrivacyHold;
        Insert: Partial<MutablePersonPrivacyHold> & { person_id: string };
        Update: Partial<MutablePersonPrivacyHold>;
        Relationships: [];
      };
      notifications: {
        Row: MutableNotification;
        Insert: Partial<MutableNotification> & { recipient_user_id: string; kind: string };
        Update: Partial<MutableNotification>;
        Relationships: [];
      };
    };
    Views: {
      match_review_cards: {
        Row: MatchReviewCardRow;
        Relationships: [];
      };
    };
    Functions: {
      create_person_with_primary_name: {
        Args: {
          p_tree_id: string;
          p_gender: GenderType;
          p_name_type?: NameType;
          p_lang?: string;
          p_given_name?: string | null;
          p_surname?: string | null;
          p_display_name_ar?: string | null;
          p_display_name_en?: string | null;
          p_birth_year?: number | null;
          p_death_year?: number | null;
          p_place_of_origin_id?: string | null;
          p_is_placeholder?: boolean;
        };
        Returns: { person_id: string; name_id: string }[];
      };
      search_master_tree: {
        Args: {
          q_free?: string | null;
          q_given?: string | null;
          q_surname?: string | null;
          q_father?: string | null;
          q_mother?: string | null;
          q_gender?: GenderType | null;
          q_birth_year?: number | null;
          q_year_window?: number | null;
          q_place_id?: string | null;
          lim?: number | null;
        };
        Returns: Array<{
          person_id: string;
          tree_id: string;
          tree_name: string;
          tree_is_public: boolean;
          tree_is_accessible: boolean;
          display_name_ar: string | null;
          display_name_en: string | null;
          primary_given: string | null;
          primary_surname: string | null;
          gender: GenderType;
          birth_year: number | null;
          origin_place_id: string | null;
          origin_name_ar: string | null;
          origin_name_en: string | null;
          score: number;
          breakdown: Json;
        }>;
      };
      compute_degrees: {
        Args: { p_source: string; p_target: string };
        Returns: Json;
      };
      can_access_tree: { Args: { p_tree_id: string }; Returns: boolean };
      can_write_tree: { Args: { p_tree_id: string }; Returns: boolean };
      is_admin: { Args: Record<string, never>; Returns: boolean };
      is_tree_owner: {
        Args: { p_tree_id: string; p_user_id: string };
        Returns: boolean;
      };
      is_tree_member: {
        Args: { p_tree_id: string; p_user_id: string };
        Returns: boolean;
      };
      is_tree_collaborator: {
        Args: { p_tree_id: string; p_user_id: string };
        Returns: boolean;
      };
      request_tree_access: {
        Args: {
          p_tree_id: string;
          p_role: TreeRole;
          p_proof_url: string;
          p_note?: string | null;
        };
        Returns: MutableTreeMember;
      };
      approve_tree_access_request: {
        Args: { p_member_id: string };
        Returns: MutableTreeMember;
      };
      reject_tree_access_request: {
        Args: { p_member_id: string; p_reason?: string | null };
        Returns: MutableTreeMember;
      };
      arabic_phonetic: { Args: { txt: string }; Returns: string };
      normalize_arabic: { Args: { txt: string }; Returns: string };
      // Matching engine (M1–M3)
      is_person_living: { Args: { p_person_id: string }; Returns: boolean };
      score_pair: {
        Args: { p_a: string; p_b: string };
        Returns: { score: number; breakdown: Json }[];
      };
      resolve_match: {
        Args: { p_match_id: string; p_decision: string; p_note?: string | null };
        Returns: undefined;
      };
      resolve_match_hint: {
        Args: { p_hint_id: string; p_accept: boolean };
        Returns: undefined;
      };
      revoke_person_link: { Args: { p_link_id: string }; Returns: undefined };
      run_matching_batch: { Args: { p_full?: boolean }; Returns: string | null };
      drain_overlay_refresh: { Args: Record<string, never>; Returns: number };
    };
    Enums: {
      gender_type: GenderType;
      event_type: EventType;
      name_type: NameType;
      pedigree_type: PedigreeType;
      match_status: MatchStatus;
      tree_role: TreeRole;
      tree_member_status: TreeMemberStatus;
      attachment_kind: AttachmentKind;
      attachment_tag: AttachmentTag;
      hint_status: HintStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
