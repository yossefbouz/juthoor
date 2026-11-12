-- R4 / AIO: place of origin must persist even when birth year is unknown.
-- Previously create_person_with_primary_name only wrote a BIRT row when
-- p_birth_year was set, so inherited origin with no year was silently dropped.

create or replace function public.create_person_with_primary_name(
  p_tree_id         uuid,
  p_gender          public.gender_type,
  p_name_type       public.name_type default 'birth',
  p_lang            text default 'ar',
  p_given_name      text default null,
  p_surname         text default null,
  p_display_name_ar text default null,
  p_display_name_en text default null,
  p_birth_year      int default null,
  p_death_year      int default null,
  p_place_of_origin_id uuid default null,
  p_is_placeholder  boolean default false
)
returns table (
  person_id uuid,
  name_id   uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_person_id uuid;
  v_name_id   uuid;
  v_user_id   uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if coalesce(p_given_name, '') = ''
     and coalesce(p_display_name_ar, '') = ''
     and coalesce(p_display_name_en, '') = '' then
    raise exception 'At least one name (given or display) is required'
      using errcode = '22004';
  end if;

  insert into public.persons (
    tree_id,
    gender,
    display_name_ar,
    display_name_en,
    created_by,
    notes
  )
  values (
    p_tree_id,
    p_gender,
    p_display_name_ar,
    p_display_name_en,
    v_user_id,
    case when p_is_placeholder then 'placeholder' else null end
  )
  returning id into v_person_id;

  insert into public.person_names (
    person_id,
    name_type,
    is_primary,
    lang,
    given_name,
    surname
  )
  values (
    v_person_id,
    p_name_type,
    true,
    p_lang,
    p_given_name,
    p_surname
  )
  returning id into v_name_id;

  -- BIRT when year and/or place of origin is known (R4 can inherit place alone).
  if p_birth_year is not null or p_place_of_origin_id is not null then
    insert into public.events (
      person_id,
      event_type,
      date_year,
      place_id
    )
    values (
      v_person_id,
      'BIRT',
      p_birth_year,
      p_place_of_origin_id
    );
  end if;

  if p_death_year is not null then
    insert into public.events (
      person_id,
      event_type,
      date_year
    )
    values (
      v_person_id,
      'DEAT',
      p_death_year
    );
  end if;

  return query select v_person_id, v_name_id;
end;
$$;

comment on function public.create_person_with_primary_name is
  'Atomic person + primary name + optional BIRT/DEAT. BIRT is written when birth year and/or place of origin is set so R4 origin inheritance persists without a year. SECURITY INVOKER.';
