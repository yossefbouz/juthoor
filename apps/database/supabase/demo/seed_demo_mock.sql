-- ============================================================================
-- Juthoor — demo / mock data for the admin interface: the LOCAL stack and the
-- STAGING project only (NOT for production)
-- ----------------------------------------------------------------------------
-- Run via:  python -I apps/database/supabase/demo/seed_demo_mock.py [--env-file …]
-- (the runner creates the demo users through the Auth admin API, uploads
--  the sample documents, then executes this file and the matching engine).
--
-- Demo accounts (local password for every account: Juthoor-Demo-2026!; on
-- staging they share a private password kept outside git, see RUN_GUIDE.md §9)
--   admin@juthoor.local          — platform admin (profiles.is_admin = true)
--   rania.khatib@juthoor.local   — owner: عائلة الخطيب — صفد
--   omar.khatib@juthoor.local    — owner: آل الخطيب، فرع عمّان
--   sami.ajrami@juthoor.local    — owner: عائلة العجرمي — المجدل
--   lina.ajrami@juthoor.local    — owner: Ajrami family (Chicago branch)
--   yousef.hajj@juthoor.local    — owner: دار الحاج — لفتا
--   maha.hajj@juthoor.local      — owner: عائلة الحاج يوسف (الكويت)
--   khalil.masri@juthoor.local   — owner: آل المصري — نابلس
--   nadia.masri@juthoor.local    — owner: عائلة المصري، فرع بيروت
--   huda.masri@juthoor.local     — verification submitter
--   karim.haddad@juthoor.local   — verification submitter
--
-- Every family is entered twice, in two relatives' separate trees, with real-
-- world spelling drift (احمد/أحمد, Ibrahim/Ibraheem, رقية/رقيه, …) so the real
-- matching engine (run_matching_batch) produces the review queue.
-- Idempotent: wipes the previous demo trees (names prefixed in demo_tree list).
-- ============================================================================

begin;

-- ---------------------------------------------------------------- helpers
create or replace function pg_temp.uid(p_email text) returns uuid
language sql stable as $$ select id from auth.users where email = p_email $$;

create or replace function pg_temp.place(p_ar text, p_en text, p_type text default 'city', p_district text default null)
returns uuid language plpgsql as $$
declare v uuid;
begin
  select id into v from public.places where name_ar = p_ar or name_en ilike p_en limit 1;
  if v is null then
    insert into public.places (name_ar, name_en, place_type, district_en)
    values (p_ar, p_en, p_type, p_district) returning id into v;
  end if;
  return v;
end $$;

create or replace function pg_temp.person(
  p_tree uuid, p_gender text, p_given_ar text, p_surname_ar text,
  p_given_en text, p_surname_en text,
  p_birth int default null, p_birth_place uuid default null,
  p_death int default null, p_death_place uuid default null)
returns uuid language plpgsql as $$
declare v uuid; v_owner uuid;
begin
  select owner_id into v_owner from public.trees where id = p_tree;
  insert into public.persons (tree_id, gender, display_name_ar, display_name_en, is_living, created_by)
  values (p_tree, p_gender::public.gender_type,
          trim(p_given_ar || ' ' || coalesce(p_surname_ar, '')),
          trim(p_given_en || ' ' || coalesce(p_surname_en, '')),
          p_death is null and coalesce(p_birth, 2000) > 1925, v_owner)
  returning id into v;
  insert into public.person_names (person_id, is_primary, lang, given_name, surname)
  values (v, true, 'ar', p_given_ar, p_surname_ar),
         (v, false, 'en', p_given_en, p_surname_en);
  if p_birth is not null then
    insert into public.events (person_id, event_type, date_value, date_year, place_id)
    values (v, 'BIRT', p_birth::text, p_birth, p_birth_place);
  end if;
  if p_death is not null then
    insert into public.events (person_id, event_type, date_value, date_year, place_id)
    values (v, 'DEAT', p_death::text, p_death, p_death_place);
  end if;
  return v;
end $$;

create or replace function pg_temp.family(p_tree uuid, p_father uuid, p_mother uuid, p_children uuid[])
returns uuid language plpgsql as $$
declare v uuid; c uuid; i int := 0;
begin
  insert into public.families (tree_id, partner1_id, partner2_id)
  values (p_tree, p_father, p_mother) returning id into v;
  foreach c in array coalesce(p_children, array[]::uuid[]) loop
    i := i + 1;
    insert into public.family_children (family_id, child_id, birth_order) values (v, c, i);
  end loop;
  return v;
end $$;

create or replace function pg_temp.tree(p_owner_email text, p_name text, p_desc text) returns uuid
language plpgsql as $$
declare v uuid; v_owner uuid := pg_temp.uid(p_owner_email);
begin
  insert into public.trees (name, description, owner_id, is_public)
  values (p_name, p_desc, v_owner, true) returning id into v;
  insert into public.tree_members (tree_id, user_id, role)
  values (v, v_owner, 'owner') on conflict do nothing;
  return v;
end $$;

-- ---------------------------------------------------------------- reset previous demo run
delete from public.identity_verifications
  where user_id in (select id from auth.users where email like '%@juthoor.local');
delete from public.notifications
  where recipient_user_id in (select id from auth.users where email like '%@juthoor.local');
delete from public.matches m
  using public.persons p, public.trees t, auth.users u
  where (m.person_a_id = p.id or m.person_b_id = p.id)
    and p.tree_id = t.id and t.owner_id = u.id and u.email like '%@juthoor.local';
delete from public.trees
  where owner_id in (select id from auth.users where email like '%@juthoor.local');

-- ---------------------------------------------------------------- profiles
update public.profiles p set
  display_name = d.en, display_name_ar = d.ar, preferred_language = 'ar',
  is_admin = (d.email = 'admin@juthoor.local')
from (values
  ('admin@juthoor.local',        'Juthoor Admin',  'مشرف جذور'),
  ('rania.khatib@juthoor.local', 'Rania Khatib',   'رانيا الخطيب'),
  ('omar.khatib@juthoor.local',  'Omar Khatib',    'عمر الخطيب'),
  ('sami.ajrami@juthoor.local',  'Sami Ajrami',    'سامي العجرمي'),
  ('lina.ajrami@juthoor.local',  'Lina Ajrami',    'لينا العجرمي'),
  ('yousef.hajj@juthoor.local',  'Yousef Al-Hajj', 'يوسف الحاج'),
  ('maha.hajj@juthoor.local',    'Maha Al-Hajj',   'مها الحاج'),
  ('khalil.masri@juthoor.local', 'Khalil Masri',   'خليل المصري'),
  ('nadia.masri@juthoor.local',  'Nadia Masri',    'نادية المصري'),
  ('huda.masri@juthoor.local',   'Huda Masri',     'هدى المصري'),
  ('karim.haddad@juthoor.local', 'Karim Haddad',   'كريم حداد')
) as d(email, en, ar)
where p.id = pg_temp.uid(d.email);

-- ---------------------------------------------------------------- trees + people
do $$
declare
  safad uuid := pg_temp.place('صفد', 'Safad', 'city', 'Safad');
  majdal uuid := pg_temp.place('المجدل', 'al-Majdal', 'city', 'Gaza');
  lifta uuid := pg_temp.place('لفتا', 'Lifta', 'village', 'Jerusalem');
  nablus uuid := pg_temp.place('نابلس', 'Nablus', 'city', 'Nablus');
  amman uuid := pg_temp.place('عمّان', 'Amman', 'diaspora_city', null);
  kuwait uuid := pg_temp.place('الكويت', 'Kuwait City', 'diaspora_city', null);
  beirut uuid := pg_temp.place('بيروت', 'Beirut', 'diaspora_city', null);
  chicago uuid := pg_temp.place('شيكاغو', 'Chicago', 'diaspora_city', null);
  t uuid;
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid; g uuid; h uuid; i uuid; j uuid;
begin
  -- ── 1. Al-Khatib, Safad ───────────────────────────────────────────────────
  t := pg_temp.tree('rania.khatib@juthoor.local', 'عائلة الخطيب — صفد',
                    'شجرة عائلة الخطيب من صفد كما رواها جدّي خليل.');
  a := pg_temp.person(t, 'M', 'محمود', 'الخطيب', 'Mahmoud', 'Al-Khatib', 1885, safad, 1952, amman);
  b := pg_temp.person(t, 'F', 'عائشة', 'الخطيب', 'Aisha', 'Al-Khatib', 1890, safad, 1960, amman);
  c := pg_temp.person(t, 'M', 'أحمد', 'الخطيب', 'Ahmad', 'Al-Khatib', 1912, safad, 1978, amman);
  d := pg_temp.person(t, 'F', 'زينب', 'الخطيب', 'Zainab', 'Al-Khatib', 1918, safad, 1990, amman);
  e := pg_temp.person(t, 'M', 'خليل', 'الخطيب', 'Khalil', 'Al-Khatib', 1940, safad, 2009, amman);
  f := pg_temp.person(t, 'F', 'مريم', 'الخطيب', 'Maryam', 'Al-Khatib', 1945, safad, 2015, amman);
  g := pg_temp.person(t, 'M', 'سامر', 'الخطيب', 'Samer', 'Al-Khatib', 1970, amman);
  h := pg_temp.person(t, 'F', 'رانيا', 'الخطيب', 'Rania', 'Al-Khatib', 1975, amman);
  perform pg_temp.family(t, a, b, array[c]);
  perform pg_temp.family(t, c, d, array[e]);
  perform pg_temp.family(t, e, f, array[g, h]);

  t := pg_temp.tree('omar.khatib@juthoor.local', 'آل الخطيب، فرع عمّان',
                    'فرع العائلة الذي استقر في عمّان بعد ١٩٤٨.');
  a := pg_temp.person(t, 'M', 'محمود', 'الخطيب', 'Mahmud', 'El-Khateeb', 1886, safad, 1951, amman);
  b := pg_temp.person(t, 'F', 'عائشه', 'الخطيب', 'Aysha', 'El-Khateeb', 1891, safad, 1960, amman);
  c := pg_temp.person(t, 'M', 'احمد', 'الخطيب', 'Ahmed', 'El-Khateeb', 1912, safad, 1979, amman);
  d := pg_temp.person(t, 'F', 'زينب', 'الخطيب', 'Zeinab', 'El-Khateeb', 1919, safad, 1990, amman);
  e := pg_temp.person(t, 'M', 'خليل', 'الخطيب', 'Khaleel', 'El-Khateeb', 1940, safad, 2009, amman);
  f := pg_temp.person(t, 'M', 'يوسف', 'الخطيب', 'Yousef', 'El-Khateeb', 1943, safad, 2011, amman);
  g := pg_temp.person(t, 'F', 'سعاد', 'الخطيب', 'Suad', 'El-Khateeb', 1947, safad, 2018, amman);
  h := pg_temp.person(t, 'M', 'عمر', 'الخطيب', 'Omar', 'El-Khateeb', 1972, amman);
  perform pg_temp.family(t, a, b, array[c]);
  perform pg_temp.family(t, c, d, array[e, f]);
  perform pg_temp.family(t, f, g, array[h]);

  -- ── 2. Al-Ajrami, al-Majdal ──────────────────────────────────────────────
  t := pg_temp.tree('sami.ajrami@juthoor.local', 'عائلة العجرمي — المجدل',
                    'من المجدل عسقلان إلى غزة.');
  a := pg_temp.person(t, 'M', 'إبراهيم', 'العجرمي', 'Ibrahim', 'Al-Ajrami', 1890, majdal, 1965, majdal);
  b := pg_temp.person(t, 'F', 'حليمة', 'العجرمي', 'Halima', 'Al-Ajrami', 1895, majdal, 1970);
  c := pg_temp.person(t, 'M', 'حسن', 'العجرمي', 'Hasan', 'Al-Ajrami', 1920, majdal, 1988);
  d := pg_temp.person(t, 'F', 'آمنة', 'العجرمي', 'Amna', 'Al-Ajrami', 1925, majdal, 2001);
  e := pg_temp.person(t, 'M', 'سامي', 'العجرمي', 'Sami', 'Al-Ajrami', 1958);
  f := pg_temp.person(t, 'F', 'نهى', 'العجرمي', 'Noha', 'Al-Ajrami', 1962);
  perform pg_temp.family(t, a, b, array[c]);
  perform pg_temp.family(t, c, d, array[e, f]);

  t := pg_temp.tree('lina.ajrami@juthoor.local', 'Ajrami family (Chicago branch)',
                    'Our branch, rebuilt from my father''s notes and UNRWA cards.');
  a := pg_temp.person(t, 'M', 'ابراهيم', 'عجرمي', 'Ibraheem', 'Ajrami', 1891, majdal, 1965, majdal);
  b := pg_temp.person(t, 'F', 'حليمه', 'عجرمي', 'Haleema', 'Ajrami', 1895, majdal, 1971);
  c := pg_temp.person(t, 'M', 'حسن', 'عجرمي', 'Hassan', 'Ajrami', 1921, majdal, 1988);
  d := pg_temp.person(t, 'F', 'امنة', 'عجرمي', 'Amneh', 'Ajrami', 1925, majdal, 2001);
  e := pg_temp.person(t, 'M', 'محمد', 'عجرمي', 'Mohammad', 'Ajrami', 1955, majdal, 2019, chicago);
  f := pg_temp.person(t, 'M', 'سامي', 'عجرمي', 'Sami', 'Ajrami', 1958);
  g := pg_temp.person(t, 'F', 'لينا', 'عجرمي', 'Lina', 'Ajrami', 1985, chicago);
  perform pg_temp.family(t, a, b, array[c]);
  perform pg_temp.family(t, c, d, array[e, f]);
  perform pg_temp.family(t, e, null, array[g]);

  -- ── 3. Al-Hajj, Lifta ────────────────────────────────────────────────────
  t := pg_temp.tree('yousef.hajj@juthoor.local', 'دار الحاج — لفتا',
                    'عائلة الحاج من قرية لفتا المهجّرة، قضاء القدس.');
  a := pg_temp.person(t, 'M', 'عبد الله', 'الحاج', 'Abdallah', 'Al-Hajj', 1880, lifta, 1948, lifta);
  b := pg_temp.person(t, 'F', 'خديجة', 'الحاج', 'Khadija', 'Al-Hajj', 1885, lifta, 1955);
  c := pg_temp.person(t, 'M', 'يوسف', 'الحاج', 'Yousef', 'Al-Hajj', 1910, lifta, 1975);
  d := pg_temp.person(t, 'F', 'رقية', 'الحاج', 'Ruqayya', 'Al-Hajj', 1915, lifta, 1990);
  e := pg_temp.person(t, 'M', 'عبد الرحمن', 'الحاج', 'Abdelrahman', 'Al-Hajj', 1945, lifta, 2020);
  f := pg_temp.person(t, 'M', 'يوسف', 'الحاج', 'Yousef', 'Al-Hajj', 1975);
  perform pg_temp.family(t, a, b, array[c]);
  perform pg_temp.family(t, c, d, array[e]);
  perform pg_temp.family(t, e, null, array[f]);

  t := pg_temp.tree('maha.hajj@juthoor.local', 'عائلة الحاج يوسف (الكويت)',
                    'جمعتها من أوراق جدتي رقية في الكويت.');
  a := pg_temp.person(t, 'M', 'عبدالله', 'الحاج', 'Abdullah', 'Al-Haj', 1880, lifta, 1948, lifta);
  b := pg_temp.person(t, 'F', 'فاطمة', 'الحاج', 'Fatima', 'Al-Haj', 1887, lifta, 1950);
  c := pg_temp.person(t, 'M', 'يوسف', 'الحاج', 'Yusuf', 'Al-Haj', 1911, lifta, 1975, kuwait);
  d := pg_temp.person(t, 'F', 'رقيه', 'الحاج', 'Rukaya', 'Al-Haj', 1916, lifta, 1990, kuwait);
  e := pg_temp.person(t, 'M', 'مصطفى', 'الحاج', 'Mustafa', 'Al-Haj', 1948, lifta, 2015, kuwait);
  f := pg_temp.person(t, 'F', 'مها', 'الحاج', 'Maha', 'Al-Haj', 1980, kuwait);
  perform pg_temp.family(t, a, b, array[c]);
  perform pg_temp.family(t, c, d, array[e]);
  perform pg_temp.family(t, e, null, array[f]);

  -- ── 4. Al-Masri, Nablus ──────────────────────────────────────────────────
  t := pg_temp.tree('khalil.masri@juthoor.local', 'آل المصري — نابلس',
                    'آل المصري من نابلس — البلدة القديمة.');
  a := pg_temp.person(t, 'M', 'طاهر', 'المصري', 'Taher', 'Al-Masri', 1870, nablus, 1940, nablus);
  b := pg_temp.person(t, 'M', 'منيب', 'المصري', 'Munib', 'Al-Masri', 1905, nablus, 1980, nablus);
  c := pg_temp.person(t, 'M', 'خليل', 'المصري', 'Khalil', 'Al-Masri', 1950, nablus);
  perform pg_temp.family(t, a, null, array[b]);
  perform pg_temp.family(t, b, null, array[c]);

  t := pg_temp.tree('nadia.masri@juthoor.local', 'عائلة المصري، فرع بيروت',
                    'فرع بيروت — منذ ١٩٤٩.');
  a := pg_temp.person(t, 'M', 'طاهر', 'المصري', 'Taher', 'Masri', 1872, nablus, 1941, nablus);
  b := pg_temp.person(t, 'M', 'منيب', 'المصري', 'Mounib', 'Masri', 1906, nablus, 1980, beirut);
  c := pg_temp.person(t, 'M', 'نديم', 'المصري', 'Nadim', 'Masri', 1948, nablus, 2018, beirut);
  d := pg_temp.person(t, 'F', 'نادية', 'المصري', 'Nadia', 'Masri', 1978, beirut);
  e := pg_temp.person(t, 'M', 'طاهر', 'المصري', 'Taher', 'Masri', 1975, beirut);
  perform pg_temp.family(t, a, null, array[b]);
  perform pg_temp.family(t, b, null, array[c]);
  perform pg_temp.family(t, c, null, array[d, e]);
end $$;

-- ---------------------------------------------------------------- identity verifications (pending)
insert into public.identity_verifications
  (user_id, tree_id, id_document_path, id_document_type, family_evidence_path, family_evidence_note, created_at)
values
  (pg_temp.uid('rania.khatib@juthoor.local'),
   (select id from public.trees where name = 'آل الخطيب، فرع عمّان'),
   pg_temp.uid('rania.khatib@juthoor.local') || '/id-passport.png', 'passport',
   pg_temp.uid('rania.khatib@juthoor.local') || '/family-evidence.png',
   'جدّي محمود الخطيب هو نفسه جدّ عمر في شجرة فرع عمّان. أرفقت صورة شهادة ميلاد والدي خليل (صفد ١٩٤٠).',
   now() - interval '3 days'),
  (pg_temp.uid('lina.ajrami@juthoor.local'),
   (select id from public.trees where name = 'عائلة العجرمي — المجدل'),
   pg_temp.uid('lina.ajrami@juthoor.local') || '/id-refugee-card.png', 'refugee_card',
   pg_temp.uid('lina.ajrami@juthoor.local') || '/family-evidence.png',
   'My grandfather Hassan Ajrami appears on our UNRWA family registration card. I would like to help edit the Majdal tree.',
   now() - interval '2 days'),
  (pg_temp.uid('huda.masri@juthoor.local'),
   (select id from public.trees where name = 'آل المصري — نابلس'),
   pg_temp.uid('huda.masri@juthoor.local') || '/id-national.png', 'national_id',
   null, 'أنا ابنة عمّ خليل المصري، وأريد إضافة فرع عائلتنا في رام الله.',
   now() - interval '20 hours'),
  (pg_temp.uid('karim.haddad@juthoor.local'), null,
   pg_temp.uid('karim.haddad@juthoor.local') || '/id-passport.png', 'passport',
   null, 'Verifying my account before I import my family''s GEDCOM file.',
   now() - interval '4 hours');

commit;
