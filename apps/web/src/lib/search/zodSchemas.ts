import { z } from 'zod';

export const GenderEnum = z.enum(['M', 'F']); // X/U hidden from UI per Step 3 decisions

export const SearchQuerySchema = z
  .object({
    q: z.string().trim().min(0).max(120).optional(),
    given: z.string().trim().min(0).max(60).optional(),
    surname: z.string().trim().min(0).max(60).optional(),
    father: z.string().trim().min(0).max(60).optional(),
    mother: z.string().trim().min(0).max(60).optional(),
    paternalGrandfather: z.string().trim().min(0).max(60).optional(),
    paternalGreatGrandfather: z.string().trim().min(0).max(60).optional(),
    placeId: z.string().uuid().optional(),
    district: z.string().trim().min(0).max(120).optional(),
    birthYear: z.coerce.number().int().min(1500).max(new Date().getUTCFullYear()).optional(),
    yearWindow: z.coerce.number().int().min(0).max(25).default(5),
    gender: GenderEnum.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (v) =>
      Boolean(
        v.q?.length ||
          v.given?.length ||
          v.surname?.length ||
          v.father?.length ||
          v.mother?.length ||
          v.paternalGrandfather?.length ||
          v.paternalGreatGrandfather?.length ||
          v.placeId ||
          v.district?.length ||
          v.birthYear,
      ),
    { message: 'At least one search field is required', path: ['q'] },
  );

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

export type ScoreBreakdown = {
  given: number;
  surname: number;
  free: number;
  father: number;
  mother: number;
  pgf?: number;
  pggf?: number;
  place: number;
  year: number;
};

export type SearchResult = {
  person_id: string;
  tree_id: string;
  tree_name: string;
  tree_is_public: boolean;
  /** True if the viewer can read this tree's data. When false, name fields are NULL server-side and the UI renders a "locked" card with a request-access CTA. */
  tree_is_accessible: boolean;
  display_name_ar: string | null;
  display_name_en: string | null;
  gender: 'M' | 'F' | 'X' | 'U' | null;
  primary_given: string | null;
  primary_surname: string | null;
  birth_year: number | null;
  origin_place_id: string | null;
  origin_name_ar: string | null;
  origin_name_en: string | null;
  score: number;
  breakdown: ScoreBreakdown;
};