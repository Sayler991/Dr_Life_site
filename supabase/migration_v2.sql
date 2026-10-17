-- =====================================================================
--  Dr Life — migration v2 : plusieurs accompagnements par rendez-vous.
--  À exécuter après schema.sql (idempotent, ne supprime aucune donnée).
--  - appointments.services : tableau JSON [{id, title, minutes}] (1 à 5 éléments)
--  - service_id / service_name conservés (1er id / titres joints par « + ») pour compatibilité
--  - durée : si l'admin renseigne « minutes » sur les accompagnements, la durée totale
--    (somme, arrondie au créneau supérieur, max 240 min) bloque les créneaux consécutifs ; sinon durée standard.
-- =====================================================================
alter table drlife.appointments add column if not exists services jsonb not null default '[]'::jsonb;
alter table drlife.appointments add column if not exists duration_minutes integer;
alter table drlife.appointments drop constraint if exists appointments_service_name_check;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dl_appt_service_name_len') then
    alter table drlife.appointments add constraint dl_appt_service_name_len check (service_name is null or char_length(service_name) <= 400);
  end if; end $$;

-- Reprise des rendez-vous existants (un seul accompagnement) : aucune autre colonne modifiée.
alter table drlife.appointments disable trigger trg_appt_before_write;
update drlife.appointments
   set services = jsonb_build_array(jsonb_build_object('id', service_id, 'title', coalesce(service_name, service_id))),
       duration_minutes = (extract(epoch from (ends_at - starts_at)) / 60)::int
 where services = '[]'::jsonb or duration_minutes is null;
alter table drlife.appointments enable trigger trg_appt_before_write;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'dl_appt_services_shape') then
    alter table drlife.appointments add constraint dl_appt_services_shape
      check (jsonb_typeof(services) = 'array' and jsonb_array_length(services) between 1 and 5);
  end if; end $$;
create index if not exists dl_appt_services_gin on drlife.appointments using gin (services jsonb_path_ops);

-- Durée totale (minutes) pour une liste d'identifiants d'accompagnements.
create or replace function drlife._duration(p_ids jsonb)
returns integer language sql stable security definer set search_path = '' as $$
  with s as (select coalesce((select slot_minutes from drlife.settings where id = 1), 60) as slot),
  m as (
    select coalesce(sum(case when coalesce(it ->> 'minutes', '') ~ '^[0-9]{1,3}$' then least((it ->> 'minutes')::int, 240) else 0 end), 0) as tot
      from drlife.site_content c, jsonb_array_elements(coalesce(c.data -> 'services' -> 'items', '[]'::jsonb)) it
     where c.id = 1 and (it ->> 'id') in (select jsonb_array_elements_text(case when jsonb_typeof(p_ids) = 'array' then p_ids else '[]'::jsonb end))
  )
  select least(greatest(s.slot, (ceil(m.tot::numeric / s.slot) * s.slot)::int), greatest(s.slot, (floor(240.0 / s.slot) * s.slot)::int))
    from s, m;
$$;

-- Trigger : complète services / service_id / service_name / durée, aussi pour les ajouts manuels de l'admin.
create or replace function drlife.appointments_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_ids jsonb;
begin
  new.name := btrim(new.name); new.phone := btrim(new.phone);
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.message := nullif(btrim(coalesce(new.message, '')), '');
  if new.services is null or jsonb_typeof(new.services) <> 'array' or jsonb_array_length(new.services) = 0 then
    if new.service_id is not null then
      new.services := jsonb_build_array(jsonb_build_object('id', new.service_id, 'title', coalesce(new.service_name, new.service_id)));
    end if;
  end if;
  if new.services is not null and jsonb_typeof(new.services) = 'array' and jsonb_array_length(new.services) > 0 then
    new.service_id := coalesce(new.services -> 0 ->> 'id', new.service_id);
    new.service_name := left((select string_agg(coalesce(x ->> 'title', x ->> 'id'), ' + ' order by o) from jsonb_array_elements(new.services) with ordinality t(x, o)), 400);
  end if;
  if new.ends_at is null or (tg_op = 'UPDATE' and new.starts_at is distinct from old.starts_at and new.ends_at = old.ends_at) then
    if tg_op = 'UPDATE' and new.ends_at = old.ends_at then
      new.ends_at := new.starts_at + (old.ends_at - old.starts_at);
    else
      select coalesce(jsonb_agg(x ->> 'id'), '[]'::jsonb) into v_ids from jsonb_array_elements(coalesce(new.services, '[]'::jsonb)) x;
      new.ends_at := new.starts_at + make_interval(mins => coalesce(new.duration_minutes, drlife._duration(v_ids)));
    end if;
  end if;
  new.duration_minutes := (extract(epoch from (new.ends_at - new.starts_at)) / 60)::int;
  if tg_op = 'INSERT' then
    if new.ref is null then new.ref := drlife.new_ref(); end if;
    new.created_at := now();
  else
    new.ref := old.ref; new.created_at := old.created_at; new.source := old.source; new.ip_hash := old.ip_hash;
  end if;
  new.updated_at := now();
  return new;
end; $$;

-- Créneaux libres pour une durée donnée (créneaux consécutifs dans une même plage horaire).
drop function if exists drlife.get_slots(date, date);
drop function if exists drlife._free_slots(date, date);
create or replace function drlife._free_slots(p_from date, p_to date, p_minutes integer default null)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with s0 as (select * from drlife.settings where id = 1 and booking_open),
  s as (select s0.*, least(greatest(s0.slot_minutes, (ceil(coalesce(p_minutes, s0.slot_minutes)::numeric / s0.slot_minutes) * s0.slot_minutes)::int),
                           greatest(s0.slot_minutes, (floor(240.0 / s0.slot_minutes) * s0.slot_minutes)::int)) as dur from s0),
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
    select (g at time zone 'Africa/Algiers') as st, (g at time zone 'Africa/Algiers') + make_interval(mins => s.dur) as en
      from ranges, s,
           generate_series(ranges.day + ranges.t0, ranges.day + ranges.t1 - make_interval(mins => s.dur), make_interval(mins => s.slot_minutes)) g
  )
  select c.st, c.en from cand c, s
   where c.st >= now() + make_interval(hours => s.min_notice_hours)
     and not exists (select 1 from drlife.appointments a
                      where a.status <> 'annulé' and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(c.st, c.en, '[)'))
   order by c.st;
$$;
create or replace function drlife.get_slots(p_from date, p_to date, p_minutes integer default null)
returns table (day date, hhmm text, starts_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'Période invalide.' using errcode = 'P0001';
  end if;
  if p_minutes is not null and (p_minutes < 15 or p_minutes > 240) then
    raise exception 'Durée invalide.' using errcode = 'P0001';
  end if;
  return query
    select (f.starts_at at time zone 'Africa/Algiers')::date, to_char(f.starts_at at time zone 'Africa/Algiers', 'HH24:MI'), f.starts_at
      from drlife._free_slots(p_from, p_to, p_minutes) f;
end; $$;

-- Réservation publique : 1 à 5 accompagnements, un seul créneau (durée calculée côté serveur).
create or replace function drlife.book_appointment(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_data jsonb; v_ids jsonb; v_srv jsonb := '[]'::jsonb; v_it jsonb; v_id text; v_fmt jsonb;
        v_start timestamptz; v_end timestamptz; v_day date; v_dur int;
        v_phone text; v_norm text; v_ip text := ''; v_hash text; v_h jsonb; r drlife.appointments;
begin
  if p is null or jsonb_typeof(p) <> 'object' or octet_length(p::text) > 8000 then
    raise exception 'Requête invalide.' using errcode = 'P0001';
  end if;
  if coalesce(p ->> 'hp', '') <> '' then raise exception 'Envoi refusé.' using errcode = 'P0001'; end if;
  if not exists (select 1 from drlife.settings where id = 1 and booking_open) then
    raise exception 'La réservation en ligne est momentanément fermée : contactez-nous par téléphone ou WhatsApp.' using errcode = 'P0001';
  end if;

  -- accompagnements : « services » (tableau d'identifiants) ou ancien champ « service » (un seul)
  if jsonb_typeof(p -> 'services') = 'array' then v_ids := p -> 'services';
  elsif coalesce(p ->> 'service', '') <> '' then v_ids := jsonb_build_array(p ->> 'service');
  else v_ids := '[]'::jsonb; end if;
  if jsonb_array_length(v_ids) < 1 then raise exception 'Choisissez au moins un accompagnement.' using errcode = 'P0001'; end if;
  if jsonb_array_length(v_ids) > 5 then raise exception 'Cinq accompagnements au maximum par rendez-vous.' using errcode = 'P0001'; end if;
  if exists (select 1 from jsonb_array_elements(v_ids) x where jsonb_typeof(x) <> 'string') then raise exception 'Accompagnement invalide.' using errcode = 'P0001'; end if;
  if (select count(distinct x) from jsonb_array_elements_text(v_ids) x) <> jsonb_array_length(v_ids) then raise exception 'Accompagnement en double.' using errcode = 'P0001'; end if;

  select data into v_data from drlife.site_content where id = 1;
  if coalesce(p ->> 'format', '') not in ('cabinet','visio','telephone') then raise exception 'Format invalide.' using errcode = 'P0001'; end if;
  select f into v_fmt from jsonb_array_elements(coalesce(v_data -> 'formats' -> 'items', '[]'::jsonb)) f where f ->> 'key' = p ->> 'format' limit 1;
  if v_fmt is not null and coalesce((v_fmt ->> 'active')::boolean, true) = false then
    raise exception 'Ce format n’est pas proposé en ce moment.' using errcode = 'P0001';
  end if;
  for v_id in select jsonb_array_elements_text(v_ids) loop
    v_it := null;
    select it into v_it from jsonb_array_elements(coalesce(v_data -> 'services' -> 'items', '[]'::jsonb)) it
     where it ->> 'id' = v_id and coalesce((it ->> 'active')::boolean, true) limit 1;
    if v_it is null then raise exception 'Accompagnement inconnu : %', left(v_id, 40) using errcode = 'P0001'; end if;
    if jsonb_typeof(v_it -> 'formats') = 'array' and jsonb_array_length(v_it -> 'formats') > 0 and not ((v_it -> 'formats') ? (p ->> 'format')) then
      raise exception 'Le format choisi n’est pas proposé pour « % ».', left(v_it ->> 'title', 80) using errcode = 'P0001';
    end if;
    v_srv := v_srv || jsonb_build_array(jsonb_build_object('id', v_it ->> 'id', 'title', left(v_it ->> 'title', 120),
               'minutes', case when coalesce(v_it ->> 'minutes', '') ~ '^[0-9]{1,3}$' then (v_it ->> 'minutes')::int else null end));
  end loop;
  v_dur := drlife._duration(v_ids);

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
  select f.ends_at into v_end from drlife._free_slots(v_day, v_day, v_dur) f where f.starts_at = v_start;
  if v_end is null then
    raise exception 'Ce créneau n’est plus disponible pour cette durée (déjà réservé ou fermé). Choisissez un autre horaire.' using errcode = 'P0001';
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
    insert into drlife.appointments (services, service_id, format, starts_at, ends_at, duration_minutes, name, phone, email, message, source, ip_hash)
    values (v_srv, v_srv -> 0 ->> 'id', p ->> 'format', v_start, v_end, v_dur, btrim(p ->> 'name'), v_phone,
            nullif(btrim(coalesce(p ->> 'email', '')), ''), nullif(btrim(left(coalesce(p ->> 'message', ''), 1000)), ''), 'site', v_hash)
    returning * into r;
  exception
    when unique_violation or exclusion_violation then
      raise exception 'Ce créneau vient d’être réservé par quelqu’un d’autre. Choisissez un autre horaire.' using errcode = 'P0001';
    when check_violation then
      raise exception 'Vérifiez vos informations (nom, téléphone, e-mail).' using errcode = 'P0001';
  end;
  return jsonb_build_object('ref', r.ref, 'service', r.service_name, 'services', r.services, 'format', r.format,
                            'starts_at', r.starts_at, 'ends_at', r.ends_at, 'minutes', r.duration_minutes, 'status', r.status);
end; $$;

-- Droits (mêmes règles qu'en v1)
revoke execute on all functions in schema drlife from public, anon, authenticated;
grant execute on function drlife.get_slots(date, date, integer) to anon, authenticated;
grant execute on function drlife.book_appointment(jsonb) to anon, authenticated;
grant execute on function drlife.new_ref() to authenticated;
grant select, insert, update, delete on drlife.appointments to authenticated;
notify pgrst, 'reload schema';
