'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';

import { requireAdmin } from '@/data/admin/requireAdmin';
import { createJuthoorSupabaseClient } from '@/supabase-clients/juthoor-server';
import type { PlaceType } from '@/data/user/places';

export type AdminPlaceRow = {
  id: string;
  name_ar: string;
  name_en: string | null;
  place_type: PlaceType | null;
  district_ar: string | null;
  district_en: string | null;
  depopulated_year: number | null;
  is_depopulated: boolean | null;
  latitude: number | null;
  longitude: number | null;
};

const PlaceTypeEnum = z.enum(['village', 'city', 'clan_locality', 'khirba']);

const UpsertSchema = z.object({
  id: z.string().uuid().optional(),
  nameAr: z.string().trim().min(1).max(200),
  nameEn: z.string().trim().max(200).nullable().optional(),
  placeType: PlaceTypeEnum.default('village'),
  districtAr: z.string().trim().max(120).nullable().optional(),
  districtEn: z.string().trim().max(120).nullable().optional(),
  depopulatedYear: z.coerce.number().int().min(1800).max(2100).nullable().optional(),
  isDepopulated: z.boolean().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
});

/** Platform Admin (D9): list places for /admin/villages. */
export async function listAdminPlaces(): Promise<AdminPlaceRow[]> {
  await requireAdmin();
  const supabase = await createJuthoorSupabaseClient();
  const { data, error } = await supabase
    .from('places')
    .select(
      'id, name_ar, name_en, place_type, district_ar, district_en, depopulated_year, is_depopulated, latitude, longitude',
    )
    .order('name_ar', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminPlaceRow[];
}

/** Create or update a VCC place (admin-only via places_*_admin RLS). */
export async function upsertAdminPlace(
  input: z.input<typeof UpsertSchema>,
): Promise<AdminPlaceRow> {
  await requireAdmin();
  const parsed = UpsertSchema.parse(input);
  const supabase = await createJuthoorSupabaseClient();
  const payload = {
    name_ar: parsed.nameAr,
    name_en: parsed.nameEn?.trim() ? parsed.nameEn.trim() : null,
    place_type: parsed.placeType,
    district_ar: parsed.districtAr?.trim() ? parsed.districtAr.trim() : null,
    district_en: parsed.districtEn?.trim() ? parsed.districtEn.trim() : null,
    depopulated_year: parsed.depopulatedYear ?? null,
    is_depopulated: parsed.isDepopulated ?? false,
    latitude: parsed.latitude ?? null,
    longitude: parsed.longitude ?? null,
    updated_at: new Date().toISOString(),
  };

  if (parsed.id) {
    const { data, error } = await supabase
      .from('places')
      .update(payload)
      .eq('id', parsed.id)
      .select(
        'id, name_ar, name_en, place_type, district_ar, district_en, depopulated_year, is_depopulated, latitude, longitude',
      )
      .single();
    if (error) throw new Error(error.message);
    revalidatePath('/admin/villages');
    revalidatePath('/villages');
    return data as AdminPlaceRow;
  }

  const { data, error } = await supabase
    .from('places')
    .insert(payload)
    .select(
      'id, name_ar, name_en, place_type, district_ar, district_en, depopulated_year, is_depopulated, latitude, longitude',
    )
    .single();
  if (error) throw new Error(error.message);
  revalidatePath('/admin/villages');
  revalidatePath('/villages');
  return data as AdminPlaceRow;
}
