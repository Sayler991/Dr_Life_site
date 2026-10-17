-- =====================================================================
--  Dr Life (Tlemcen) — contenu du site, disponibilités, rendez-vous
--  Schéma isolé « drlife » du projet Supabase partagé. Idempotent.
--  Propriétaire : public.owners / public.is_owner() (existants, partagés).
--  Fuseau des créneaux : Africa/Algiers.
-- =====================================================================
create schema if not exists drlife;
grant usage on schema drlife to anon, authenticated, service_role;

-- 1. CONTENU + HISTORIQUE ------------------------------------------------
create table if not exists drlife.site_content (
  id integer primary key default 1 check (id = 1),
  data jsonb not null check (jsonb_typeof(data) = 'object') check (octet_length(data::text) <= 524288),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create table if not exists drlife.site_content_history (
  id bigint generated always as identity primary key,
  saved_at timestamptz not null default now(),
  saved_by uuid,
  data jsonb not null
);
create or replace function drlife.site_content_before_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.data is distinct from old.data then
    insert into drlife.site_content_history (saved_by, data) values (old.updated_by, old.data);
    delete from drlife.site_content_history
     where id not in (select id from drlife.site_content_history order by id desc limit 50);
  end if;
  new.updated_at := now(); new.updated_by := auth.uid(); new.id := old.id;
  return new;
end; $$;
drop trigger if exists trg_site_content_before_update on drlife.site_content;
create trigger trg_site_content_before_update before update on drlife.site_content
  for each row execute function drlife.site_content_before_update();

-- 2. DISPONIBILITÉS --------------------------------------------------------
-- week : clés ISO 1 = lundi … 7 = dimanche ; valeur = liste de plages [["09:00","12:00"], …]
create table if not exists drlife.settings (
  id integer primary key default 1 check (id = 1),
  booking_open boolean not null default true,
  slot_minutes integer not null default 60 check (slot_minutes between 15 and 240),
  min_notice_hours integer not null default 2 check (min_notice_hours between 0 and 168),
  max_days_ahead integer not null default 60 check (max_days_ahead between 1 and 365),
  week jsonb not null default '{"1":[["09:00","12:00"],["14:00","18:00"]],"2":[["09:00","12:00"],["14:00","18:00"]],"3":[["09:00","12:00"],["14:00","18:00"]],"4":[["09:00","12:00"],["14:00","18:00"]],"5":[],"6":[["09:00","12:00"],["14:00","18:00"]],"7":[["09:00","12:00"],["14:00","18:00"]]}'::jsonb,
  updated_at timestamptz not null default now()
);
create or replace function drlife.settings_validate()
returns trigger language plpgsql set search_path = '' as $$
declare k text; r jsonb;
begin
  if jsonb_typeof(new.week) <> 'object' then raise exception 'Semaine invalide.' using errcode = 'P0001'; end if;
  for k in select jsonb_object_keys(new.week) loop
    if k !~ '^[1-7]$' then raise exception 'Jour invalide : %', k using errcode = 'P0001'; end if;
    if jsonb_typeof(new.week -> k) <> 'array' or jsonb_array_length(new.week -> k) > 8 then raise exception 'Plages invalides.' using errcode = 'P0001'; end if;
    for r in select * from jsonb_array_elements(new.week -> k) loop
      if jsonb_typeof(r) <> 'array' or jsonb_array_length(r) <> 2
         or coalesce(r ->> 0, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
         or coalesce(r ->> 1, '') !~ '^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$'
         or (r ->> 0)::time >= (case when r ->> 1 = '24:00' then '23:59:59'::time else (r ->> 1)::time end) then
        raise exception 'Plage horaire invalide (format HH:MM, début avant fin).' using errcode = 'P0001';
      end if;
    end loop;
  end loop;
  new.id := 1; new.updated_at := now();
  return new;
end; $$;
drop trigger if exists trg_settings_validate on drlife.settings;
create trigger trg_settings_validate before insert or update on drlife.settings
  for each row execute function drlife.settings_validate();

create table if not exists drlife.blocked_dates (
  day date primary key,
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now()
);

-- 3. RENDEZ-VOUS -----------------------------------------------------------
create table if not exists drlife.appointments (
  id bigint generated always as identity primary key,
  ref text not null unique,
  status text not null default 'en attente' check (status in ('en attente','confirmé','annulé','terminé')),
  service_id text not null check (char_length(service_id) between 1 and 60),
  service_name text check (service_name is null or char_length(service_name) <= 120),
  format text not null check (format in ('cabinet','visio','telephone')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  phone text not null check (phone ~ '^\+?[0-9][0-9 .-]{7,18}[0-9]$'),
  email text check (email is null or (char_length(email) <= 120 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  message text check (message is null or char_length(message) <= 1000),
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000),
  source text not null default 'site' check (source in ('site','admin')),
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appt_time_order check (ends_at > starts_at)
);
create or replace function drlife.new_ref()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; r text; i int;
begin
  loop
    r := 'DL-';
    for i in 1..5 loop r := r || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists (select 1 from drlife.appointments where ref = r);
  end loop;
  return r;
end; $$;
alter table drlife.appointments alter column ref set default drlife.new_ref();
-- Anti double réservation (serveur) : un seul rendez-vous actif par horaire, et aucun chevauchement.
create unique index if not exists dl_appt_slot_uq on drlife.appointments (starts_at) where status <> 'annulé';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dl_appt_no_overlap') then
    alter table drlife.appointments add constraint dl_appt_no_overlap
      exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&) where (status <> 'annulé');
  end if; end $$;
create index if not exists dl_appt_created_idx on drlife.appointments (created_at desc);
create index if not exists dl_appt_status_idx on drlife.appointments (status);

create or replace function drlife.appointments_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_min int;
begin
  new.name := btrim(new.name); new.phone := btrim(new.phone);
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.message := nullif(btrim(coalesce(new.message, '')), '');
  if new.ends_at is null or (tg_op = 'UPDATE' and new.starts_at is distinct from old.starts_at and new.ends_at = old.ends_at) then
    select slot_minutes into v_min from drlife.settings where id = 1;
    new.ends_at := new.starts_at + make_interval(mins => coalesce(v_min, 60));
  end if;
  if tg_op = 'INSERT' then
    if new.ref is null then new.ref := drlife.new_ref(); end if;
    new.created_at := now();
  else
    new.ref := old.ref; new.created_at := old.created_at; new.source := old.source; new.ip_hash := old.ip_hash;
  end if;
  new.updated_at := now();
  return new;
end; $$;
drop trigger if exists trg_appt_before_write on drlife.appointments;
create trigger trg_appt_before_write before insert or update on drlife.appointments
  for each row execute function drlife.appointments_before_write();

-- 4. CRÉNEAUX ----------------------------------------------------------------
create or replace function drlife._free_slots(p_from date, p_to date)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with s as (select * from drlife.settings where id = 1 and booking_open),
  today as (select (now() at time zone 'Africa/Algiers')::date as d),
  days as (
    select g::date as day
      from s, today, generate_series(greatest(p_from, today.d)::timestamp, least(p_to, today.d + s.max_days_ahead)::timestamp, interval '1 day') g
  ),
  ranges as (
    select days.day, (r ->> 0)::time as t0, case when r ->> 1 = '24:00' then interval '24 hours' else (r ->> 1)::time::interval end as t1
      from days, s, jsonb_array_elements(coalesce(s.week -> extract(isodow from days.day)::int::text, '[]'::jsonb)) r
     where not exists (select 1 from drlife.blocked_dates b where b.day = days.day)
  ),
  cand as (
    select (g at time zone 'Africa/Algiers') as st, (g at time zone 'Africa/Algiers') + make_interval(mins => s.slot_minutes) as en
      from ranges, s,
           generate_series(ranges.day + ranges.t0, ranges.day + ranges.t1 - make_interval(mins => s.slot_minutes), make_interval(mins => s.slot_minutes)) g
  )
  select c.st, c.en from cand c, s
   where c.st >= now() + make_interval(hours => s.min_notice_hours)
     and not exists (select 1 from drlife.appointments a
                      where a.status <> 'annulé' and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(c.st, c.en, '[)'))
   order by c.st;
$$;

-- Public : créneaux libres (aucune donnée de rendez-vous n'est exposée).
create or replace function drlife.get_slots(p_from date, p_to date)
returns table (day date, hhmm text, starts_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Période invalide.' using errcode = 'P0001';
  end if;
  return query
    select (f.starts_at at time zone 'Africa/Algiers')::date, to_char(f.starts_at at time zone 'Africa/Algiers', 'HH24:MI'), f.starts_at
      from drlife._free_slots(p_from, p_to) f;
end; $$;

-- Public : réservation. Validation complète côté serveur + limites anti-abus.
create or replace function drlife.book_appointment(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_data jsonb; v_srv jsonb; v_fmt jsonb; v_start timestamptz; v_end timestamptz; v_day date;
        v_phone text; v_norm text; v_ip text := ''; v_hash text; v_h jsonb; r drlife.appointments;
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 8000 then
    raise exception 'Requête invalide.' using errcode = 'P0001';
  end if;
  if coalesce(p ->> 'hp', '') <> '' then raise exception 'Envoi refusé.' using errcode = 'P0001'; end if;
  if not exists (select 1 from drlife.settings where id = 1 and booking_open) then
    raise exception 'La réservation en ligne est momentanément fermée : contactez-nous par téléphone ou WhatsApp.' using errcode = 'P0001';
  end if;

  select data into v_data from drlife.site_content where id = 1;
  select it into v_srv from jsonb_array_elements(coalesce(v_data -> 'services' -> 'items', '[]'::jsonb)) it
   where it ->> 'id' = p ->> 'service' and coalesce((it ->> 'active')::boolean, true) limit 1;
  if v_srv is null then raise exception 'Accompagnement inconnu.' using errcode = 'P0001'; end if;
  if coalesce(p ->> 'format', '') not in ('cabinet','visio','telephone') then raise exception 'Format invalide.' using errcode = 'P0001'; end if;
  select f into v_fmt from jsonb_array_elements(coalesce(v_data -> 'formats' -> 'items', '[]'::jsonb)) f where f ->> 'key' = p ->> 'format' limit 1;
  if v_fmt is not null and coalesce((v_fmt ->> 'active')::boolean, true) = false then
    raise exception 'Ce format n’est pas proposé en ce moment.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_srv -> 'formats') = 'array' and jsonb_array_length(v_srv -> 'formats') > 0
     and not ((v_srv -> 'formats') ? (p ->> 'format')) then
    raise exception 'Ce format n’est pas proposé pour cet accompagnement.' using errcode = 'P0001';
  end if;

  v_phone := btrim(coalesce(p ->> 'phone', ''));
  if v_phone !~ '^\+?[0-9][0-9 .-]{7,18}[0-9]$' then raise exception 'Numéro de téléphone invalide.' using errcode = 'P0001'; end if;
  if char_length(btrim(coalesce(p ->> 'name', ''))) not between 2 and 80 then raise exception 'Indiquez votre nom (2 à 80 caractères).' using errcode = 'P0001'; end if;
  if nullif(btrim(coalesce(p ->> 'email', '')), '') is not null and btrim(p ->> 'email') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse e-mail invalide.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(p ->> 'message', '')) > 1000 then raise exception 'Message trop long (1000 caractères maximum).' using errcode = 'P0001'; end if;

  begin v_start := (p ->> 'starts_at')::timestamptz; exception when others then v_start := null; end;
  if v_start is null then raise exception 'Créneau invalide.' using errcode = 'P0001'; end if;
  v_day := (v_start at time zone 'Africa/Algiers')::date;
  select f.ends_at into v_end from drlife._free_slots(v_day, v_day) f where f.starts_at = v_start;
  if v_end is null then
    raise exception 'Ce créneau n’est plus disponible (déjà réservé ou fermé). Choisissez un autre horaire.' using errcode = 'P0001';
  end if;

  -- Limites anti-abus
  if (select count(*) from drlife.appointments where source = 'site' and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'Trop de réservations en ce moment, réessayez dans quelques minutes.' using errcode = 'P0001';
  end if;
  v_norm := regexp_replace(v_phone, '[^0-9]', '', 'g');
  if (select count(*) from drlife.appointments
       where regexp_replace(phone, '[^0-9]', '', 'g') = v_norm and status in ('en attente','confirmé') and starts_at > now()) >= 3 then
    raise exception 'Vous avez déjà plusieurs rendez-vous à venir : contactez-nous par téléphone ou WhatsApp pour en ajouter.' using errcode = 'P0001';
  end if;
  begin
    v_h := nullif(current_setting('request.headers', true), '')::jsonb;
    v_ip := btrim(split_part(coalesce(v_h ->> 'cf-connecting-ip', v_h ->> 'x-forwarded-for', ''), ',', 1));
  exception when others then v_ip := ''; end;
  if v_ip <> '' then
    v_hash := md5('drlife:' || v_ip);
    if (select count(*) from drlife.appointments where ip_hash = v_hash and created_at > now() - interval '1 hour') >= 6 then
      raise exception 'Trop de réservations depuis cette connexion : réessayez plus tard ou appelez-nous.' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into drlife.appointments (service_id, service_name, format, starts_at, ends_at, name, phone, email, message, source, ip_hash)
    values (v_srv ->> 'id', left(v_srv ->> 'title', 120), p ->> 'format', v_start, v_end, btrim(p ->> 'name'), v_phone,
            nullif(btrim(coalesce(p ->> 'email', '')), ''), nullif(btrim(left(coalesce(p ->> 'message', ''), 1000)), ''), 'site', v_hash)
    returning * into r;
  exception
    when unique_violation or exclusion_violation then
      raise exception 'Ce créneau vient d’être réservé par quelqu’un d’autre. Choisissez un autre horaire.' using errcode = 'P0001';
    when check_violation then
      raise exception 'Vérifiez vos informations (nom, téléphone, e-mail).' using errcode = 'P0001';
  end;
  return jsonb_build_object('ref', r.ref, 'service', r.service_name, 'format', r.format,
                            'starts_at', r.starts_at, 'ends_at', r.ends_at, 'status', r.status);
end; $$;

-- 5. DROITS + RLS ------------------------------------------------------------
revoke all on all tables in schema drlife from anon, authenticated;
revoke execute on all functions in schema drlife from public, anon, authenticated;
grant execute on function drlife.get_slots(date, date) to anon, authenticated;
grant execute on function drlife.book_appointment(jsonb) to anon, authenticated;
grant execute on function drlife.new_ref() to authenticated;
grant select on drlife.site_content to anon, authenticated;
grant insert, update on drlife.site_content to authenticated;
grant select on drlife.site_content_history to authenticated;
grant select on drlife.settings to anon, authenticated;
grant insert, update on drlife.settings to authenticated;
grant select (day) on drlife.blocked_dates to anon;
grant select, insert, update, delete on drlife.blocked_dates to authenticated;
grant select, insert, update, delete on drlife.appointments to authenticated;
grant all on all tables in schema drlife to service_role;

alter table drlife.site_content enable row level security;
alter table drlife.site_content_history enable row level security;
alter table drlife.settings enable row level security;
alter table drlife.blocked_dates enable row level security;
alter table drlife.appointments enable row level security;
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'drlife' loop
    execute format('drop policy if exists %I on drlife.%I', r.policyname, r.tablename);
  end loop; end $$;
create policy "contenu : lecture publique" on drlife.site_content for select to anon, authenticated using (true);
create policy "contenu : ajout propriétaire" on drlife.site_content for insert to authenticated with check (id = 1 and public.is_owner());
create policy "contenu : modification propriétaire" on drlife.site_content for update to authenticated
  using (id = 1 and public.is_owner()) with check (id = 1 and public.is_owner());
create policy "historique : propriétaire" on drlife.site_content_history for select to authenticated using (public.is_owner());
create policy "réglages : lecture publique" on drlife.settings for select to anon, authenticated using (true);
create policy "réglages : ajout propriétaire" on drlife.settings for insert to authenticated with check (public.is_owner());
create policy "réglages : modification propriétaire" on drlife.settings for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "dates bloquées : lecture publique" on drlife.blocked_dates for select to anon, authenticated using (true);
create policy "dates bloquées : ajout propriétaire" on drlife.blocked_dates for insert to authenticated with check (public.is_owner());
create policy "dates bloquées : modif propriétaire" on drlife.blocked_dates for update to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "dates bloquées : suppression propriétaire" on drlife.blocked_dates for delete to authenticated using (public.is_owner());
create policy "rendez-vous : propriétaire" on drlife.appointments for all to authenticated using (public.is_owner()) with check (public.is_owner());

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'drlife' and tablename = 'appointments') then
    alter publication supabase_realtime add table drlife.appointments;
  end if; end $$;
