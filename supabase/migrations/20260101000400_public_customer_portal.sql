-- ============================================================================
-- WerkstattFlow — Migration 5/5: Öffentliches Kundenportal (Baustein 2)
-- ============================================================================
-- Der Kunde ist NICHT angemeldet. Er darf deshalb auf keine Tabelle zugreifen
-- (siehe Migration 2: für "anon" ist jeder Tabellenzugriff entzogen). Stattdessen
-- bekommt er vier eng gefasste SECURITY-DEFINER-Funktionen:
--
--   1. public.get_public_workshop(p_slug)              — Werkstatt-Stammdaten für
--                                                        die öffentliche Startseite
--   2. public.get_public_availabilities(p_slug)        — Öffnungszeiten / Regeln,
--                                                        Grundlage des Kalenders
--   3. public.get_public_busy_times(p_slug, von, bis)  — belegte Zeitfenster
--                                                        (NUR Zeiten, keine Namen)
--   4. public.create_public_request(...)               — legt Kunde, Fahrzeug und
--                                                        Anfrage an (der EINZIGE
--                                                        Schreibweg für Nicht-
--                                                        angemeldete)
--
-- Dazu wird die bestehende Funktion public.get_public_request(p_token) um die
-- Felder erweitert, die die Statusseite zusätzlich braucht (Termin, Adresse,
-- Fahrzeugbezeichnung). Die Eigenschaft bleibt unverändert: genau EINE Anfrage
-- anhand ihres Tokens, keine Kunden-, Fremd- oder Mandantendaten.
--
-- Sicherheitsprinzip für alle vier Funktionen:
--   * SECURITY DEFINER und `set search_path = pg_catalog, public, pg_temp`
--     (verhindert, dass ein manipulierter search_path fremden Code ausführt).
--   * Der Mandant wird AUSSCHLIESSLICH über den öffentlichen Werkstatt-Slug
--     bestimmt — es gibt keinen Parameter company_id. Damit kann ein Aufrufer
--     nicht behaupten, eine andere Werkstatt zu sein.
--   * Rückgabefelder sind bewusst aufgezählt (kein `select *`), damit nie
--     versehentlich interne Spalten nach außen wandern.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Öffentliches Profil einer Werkstatt (Startseite des Kundenportals)
-- ----------------------------------------------------------------------------
create or replace function public.get_public_workshop(p_slug text)
returns table (
  id           uuid,
  name         text,
  slug         text,
  street       text,
  postal_code  text,
  city         text,
  phone        text,
  email        text,
  accent_color text,
  slot_minutes integer,
  timezone     text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    c.id, c.name, c.slug, c.street, c.postal_code, c.city,
    c.phone, c.email, c.accent_color, c.slot_minutes, c.timezone
  from public.companies c
  where c.slug = lower(btrim(coalesce(p_slug, '')))
    and c.is_active;
$$;

comment on function public.get_public_workshop(text) is
  'Öffentliche Stammdaten einer Werkstatt über ihren Slug (Kundenportal, Baustein 2). Liefert nur Felder, die auf der Kundenseite sichtbar sein dürfen — keine internen Angaben.';

-- ----------------------------------------------------------------------------
-- 2. Öffnungszeiten / Verfügbarkeiten (Grundlage des freien Kalenders)
-- ----------------------------------------------------------------------------
-- Die Notiz wird nur bei Schließungen (Betriebsferien, Sonntag) herausgegeben —
-- bei normalen Wochentagen ist sie eine interne Notiz der Werkstatt.
create or replace function public.get_public_availabilities(p_slug text)
returns table (
  weekday       smallint,
  specific_date date,
  is_closed     boolean,
  open_time     time,
  close_time    time,
  slot_minutes  integer,
  capacity      smallint,
  note          text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    a.weekday,
    a.specific_date,
    a.is_closed,
    a.open_time,
    a.close_time,
    a.slot_minutes,
    a.capacity,
    case when a.is_closed or a.specific_date is not null then a.note else null end
  from public.availabilities a
  join public.companies c on c.id = a.company_id
  where c.slug = lower(btrim(coalesce(p_slug, '')))
    and c.is_active;
$$;

comment on function public.get_public_availabilities(text) is
  'Öffnungszeiten und Ausnahmen (Betriebsferien) einer Werkstatt über ihren Slug. Grundlage für die Berechnung freier Termine im Kundenkalender.';

-- ----------------------------------------------------------------------------
-- 3. Belegte Zeitfenster (Auslastung) für den Kalender
-- ----------------------------------------------------------------------------
-- Bewusst NUR Datum + Minuten — keine Kundennamen, Kennzeichen, Fahrzeuge oder
-- Termin-Titel. Mehr braucht die Berechnung freier Slots nicht (siehe
-- src/lib/portal/kalender.ts, reine und getestete Funktion).
--
-- Der Zeitraum wird serverseitig begrenzt (heute bis höchstens 180 Tage in die
-- Zukunft, längstens 120 Tage am Stück). Damit kann ein Besucher die Auslastung
-- der Werkstatt nicht über Jahre hinweg abfragen.
create or replace function public.get_public_busy_times(
  p_slug text,
  p_from date,
  p_to   date
)
returns table (
  day           date,
  starts_minute integer,
  ends_minute   integer
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with fenster as (
    select
      greatest(coalesce(p_from, (now() at time zone c.timezone)::date),
               (now() at time zone c.timezone)::date) as von,
      least(coalesce(p_to, (now() at time zone c.timezone)::date + 60),
            greatest(coalesce(p_from, (now() at time zone c.timezone)::date),
                     (now() at time zone c.timezone)::date) + 119) as bis
    from public.companies c
    where c.slug = lower(btrim(coalesce(p_slug, '')))
      and c.is_active
  )
  select
    (a.starts_at at time zone c.timezone)::date as day,
    greatest(0, (extract(hour from (a.starts_at at time zone c.timezone))::integer * 60
                 + extract(minute from (a.starts_at at time zone c.timezone))::integer)) as starts_minute,
    least(1440, greatest(0, (extract(hour from (a.ends_at at time zone c.timezone))::integer * 60
                 + extract(minute from (a.ends_at at time zone c.timezone))::integer))) as ends_minute
  from public.appointments a
  join public.companies c on c.id = a.company_id
  cross join fenster f
  where c.slug = lower(btrim(coalesce(p_slug, '')))
    and c.is_active
    and a.status in ('geplant', 'bestaetigt', 'abgeschlossen')
    and (a.starts_at at time zone c.timezone)::date between f.von and f.bis
    and f.bis >= f.von;
$$;

comment on function public.get_public_busy_times(text, date, date) is
  'Belegte Zeitfenster einer Werkstatt als Tag + Minuten — ausschließlich Zeiten, keine Personen- oder Fahrzeugdaten. Grundlage der Kalenderberechnung im Kundenportal.';

-- ----------------------------------------------------------------------------
-- 4. Öffentliche Anfrage anlegen (einziger Schreibweg für Nicht-angemeldete)
-- ----------------------------------------------------------------------------
-- Legt in einem Schritt an: Kunde (wiedererkannt über E-Mail bzw. Telefon),
-- Fahrzeug (wiedererkannt über Kennzeichen, sonst über Kunde + Marke/Modell)
-- und die Anfrage selbst (Status 'neu', Quelle 'online', mit der
-- Preisschätzung aus der Anwendungslogik).
--
-- Fehlerkennungen (werden in der Oberfläche übersetzt, siehe
-- src/lib/portal/fehler.ts):
--   werkstatt_unbekannt | eingabe_ungueltig | zu_schnell | zu_viele_anfragen
create or replace function public.create_public_request(
  p_slug                 text,
  p_service_type         text,
  p_description          text,
  p_preferred_date       date,
  p_preferred_time_note  text,
  p_first_name           text,
  p_last_name            text,
  p_email                text,
  p_phone                text,
  p_contact_preference   text,
  p_vehicle_make         text,
  p_vehicle_model        text,
  p_vehicle_year         integer,
  p_vehicle_mileage      integer,
  p_license_plate        text,
  p_estimated_price_min  numeric,
  p_estimated_price_max  numeric,
  p_price_estimate_note  text
)
returns table (
  public_token uuid,
  reference    text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_company            uuid;
  v_timezone           text;
  v_customer           uuid;
  v_vehicle            uuid;
  v_slug               text := lower(btrim(coalesce(p_slug, '')));
  v_service            text := left(btrim(coalesce(p_service_type, '')), 120);
  v_description        text := nullif(left(btrim(coalesce(p_description, '')), 2000), '');
  v_first_name         text := left(btrim(coalesce(p_first_name, '')), 80);
  v_last_name          text := left(btrim(coalesce(p_last_name, '')), 80);
  v_email              text := nullif(lower(left(btrim(coalesce(p_email, '')), 160)), '');
  v_phone              text := nullif(left(btrim(coalesce(p_phone, '')), 40), '');
  v_make               text := left(btrim(coalesce(p_vehicle_make, '')), 80);
  v_model              text := left(btrim(coalesce(p_vehicle_model, '')), 80);
  v_plate              text := nullif(upper(left(btrim(coalesce(p_license_plate, '')), 20)), '');
  v_preference         text;
  v_price_min          numeric;
  v_price_max          numeric;
  v_price_tausch       numeric;
  v_token              uuid;
  v_reference          text;
begin
  -- 4.1 Werkstatt über den Slug bestimmen (kein company_id-Parameter!)
  select c.id, c.timezone into v_company, v_timezone
    from public.companies c
   where c.slug = v_slug and c.is_active;

  if v_company is null then
    raise exception 'werkstatt_unbekannt';
  end if;

  -- 4.2 Eingaben prüfen (die Oberfläche validiert zusätzlich, hier die harte Grenze)
  if v_service = ''
     or v_first_name = ''
     or v_last_name = ''
     or v_make = ''
     or v_model = ''
     or p_preferred_date is null
  then
    raise exception 'eingabe_ungueltig';
  end if;

  if v_email is null and v_phone is null then
    raise exception 'eingabe_ungueltig';
  end if;

  if v_email is not null and v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'eingabe_ungueltig';
  end if;

  -- "Heute" in der Zeitzone der Werkstatt (nicht in der des Servers).
  if p_preferred_date < (now() at time zone coalesce(v_timezone, 'Europe/Berlin'))::date then
    raise exception 'eingabe_ungueltig';
  end if;

  if p_vehicle_year is not null and (p_vehicle_year < 1886 or p_vehicle_year > 2100) then
    raise exception 'eingabe_ungueltig';
  end if;

  if p_vehicle_mileage is not null and p_vehicle_mileage < 0 then
    raise exception 'eingabe_ungueltig';
  end if;

  v_preference := case
    when p_contact_preference in ('email', 'telefon', 'sms') then p_contact_preference
    else 'email'
  end;
  -- Ohne Telefonnummer ist ein Rückruf nicht möglich → dann E-Mail.
  if v_preference in ('telefon', 'sms') and v_phone is null then
    v_preference := 'email';
  end if;

  -- Preis: immer als gültige Spanne speichern (von <= bis).
  if p_estimated_price_min is null and p_estimated_price_max is null then
    v_price_min := null;
    v_price_max := null;
  else
    v_price_min := greatest(coalesce(p_estimated_price_min, coalesce(p_estimated_price_max, 0)), 0);
    v_price_max := greatest(coalesce(p_estimated_price_max, coalesce(p_estimated_price_min, 0)), 0);
    if v_price_max < v_price_min then
      v_price_tausch := v_price_min;
      v_price_min := v_price_max;
      v_price_max := v_price_tausch;
    end if;
  end if;

  -- 4.3 Einfacher Missbrauchsschutz in der Datenbank (ergänzt Honeypot und
  --     Ratenbegrenzung der Oberfläche): keine Anfrage-Flut pro Kunde.
  if exists (
    select 1 from public.requests r
      join public.customers c on c.id = r.customer_id
     where r.company_id = v_company
       and r.created_at > now() - interval '60 seconds'
       and ((v_email is not null and lower(c.email) = v_email)
            or (v_phone is not null and c.phone = v_phone))
  ) then
    raise exception 'zu_schnell';
  end if;

  if (
    select count(*) from public.requests r
      join public.customers c on c.id = r.customer_id
     where r.company_id = v_company
       and r.created_at > now() - interval '60 minutes'
       and ((v_email is not null and lower(c.email) = v_email)
            or (v_phone is not null and c.phone = v_phone))
  ) >= 5 then
    raise exception 'zu_viele_anfragen';
  end if;

  -- 4.4 Kunde wiedererkennen (E-Mail hat Vorrang vor Telefonnummer)
  select c.id into v_customer
    from public.customers c
   where c.company_id = v_company
     and ((v_email is not null and lower(c.email) = v_email)
          or (v_phone is not null and c.phone = v_phone))
   order by case when v_email is not null and lower(c.email) = v_email then 0 else 1 end,
            c.created_at
   limit 1;

  if v_customer is null then
    insert into public.customers (company_id, first_name, last_name, email, phone)
    values (v_company, v_first_name, v_last_name, v_email, v_phone)
    returning id into v_customer;
  else
    -- Vorhandene Stammdaten nicht überschreiben, nur Lücken füllen.
    update public.customers
       set first_name = coalesce(nullif(first_name, ''), v_first_name),
           last_name  = coalesce(nullif(last_name, ''), v_last_name),
           email      = coalesce(email, v_email),
           phone      = coalesce(phone, v_phone)
     where id = v_customer;
  end if;

  -- 4.5 Fahrzeug wiedererkennen: zuerst über das Kennzeichen, dann über
  --     Kunde + Marke/Modell.
  if v_plate is not null then
    select v.id into v_vehicle
      from public.vehicles v
     where v.company_id = v_company
       and upper(coalesce(v.license_plate, '')) = v_plate
     limit 1;
  end if;

  if v_vehicle is null then
    select v.id into v_vehicle
      from public.vehicles v
     where v.company_id = v_company
       and v.customer_id = v_customer
       and lower(v.make) = lower(v_make)
       and lower(v.model) = lower(v_model)
     limit 1;
  end if;

  if v_vehicle is null then
    insert into public.vehicles (
      company_id, customer_id, make, model, year, license_plate, mileage_km
    )
    values (
      v_company, v_customer, v_make, v_model,
      p_vehicle_year, v_plate, p_vehicle_mileage
    )
    returning id into v_vehicle;
  else
    -- Nur ergänzen/erhöhen, nie zurücksetzen (Kilometerstand wächst monoton).
    update public.vehicles
       set year          = coalesce(year, p_vehicle_year),
           license_plate = coalesce(license_plate, v_plate),
           mileage_km    = case
             when p_vehicle_mileage is null then mileage_km
             else greatest(coalesce(mileage_km, 0), p_vehicle_mileage)
           end
     where id = v_vehicle;
  end if;

  -- 4.6 Anfrage anlegen: Status 'neu', Quelle 'online'
  insert into public.requests (
    company_id, customer_id, vehicle_id, status, service_type, description,
    preferred_date_from, preferred_date_to, preferred_time_note,
    estimated_price_min, estimated_price_max, price_estimate_note,
    contact_preference, source
  )
  values (
    v_company, v_customer, v_vehicle, 'neu', v_service, v_description,
    p_preferred_date, p_preferred_date, nullif(left(btrim(coalesce(p_preferred_time_note, '')), 120), ''),
    v_price_min, v_price_max, nullif(left(btrim(coalesce(p_price_estimate_note, '')), 400), ''),
    v_preference, 'online'
  )
  returning requests.public_token, requests.reference into v_token, v_reference;

  return query select v_token, v_reference;
end;
$$;

comment on function public.create_public_request(text, text, text, date, text, text, text, text, text, text, text, text, integer, integer, text, numeric, numeric, text) is
  'Legt Kunde, Fahrzeug und Anfrage aus dem öffentlichen Kundenportal an (Baustein 2). Einziger Schreibweg für nicht angemeldete Besucher; der Mandant wird allein über den Werkstatt-Slug bestimmt.';

-- ----------------------------------------------------------------------------
-- 5. get_public_request erweitern (Termin, Adresse, Fahrzeugbezeichnung)
-- ----------------------------------------------------------------------------
-- Die Rückgabefelder ändern sich, deshalb muss die Funktion ersetzt (nicht nur
-- überschrieben) werden. Eigenschaft bleibt unverändert: GENAU EINE Anfrage
-- anhand ihres Tokens.
drop function if exists public.get_public_request(uuid);

create function public.get_public_request(p_token uuid)
returns table (
  reference             text,
  status                text,
  service_type          text,
  description           text,
  preferred_date_from   date,
  preferred_date_to     date,
  preferred_time_note   text,
  estimated_price_min   numeric,
  estimated_price_max   numeric,
  price_estimate_note   text,
  rejection_reason      text,
  vehicle_make          text,
  vehicle_model         text,
  appointment_starts_at timestamp,
  appointment_ends_at   timestamp,
  workshop_name         text,
  workshop_slug         text,
  workshop_phone        text,
  workshop_email        text,
  workshop_street       text,
  workshop_postal_code  text,
  workshop_city         text,
  created_at            timestamptz,
  updated_at            timestamptz,
  decided_at            timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select
    r.reference,
    r.status,
    r.service_type,
    r.description,
    r.preferred_date_from,
    r.preferred_date_to,
    r.preferred_time_note,
    r.estimated_price_min,
    r.estimated_price_max,
    r.price_estimate_note,
    r.rejection_reason,
    v.make,
    v.model,
    (a.starts_at at time zone c.timezone),
    (a.ends_at at time zone c.timezone),
    c.name,
    c.slug,
    c.phone,
    c.email,
    c.street,
    c.postal_code,
    c.city,
    r.created_at,
    r.updated_at,
    r.decided_at
  from public.requests r
  join public.companies c on c.id = r.company_id
  left join public.vehicles v on v.id = r.vehicle_id
  left join public.appointments a on a.request_id = r.id
  where r.public_token = p_token
  order by a.starts_at nulls last, r.created_at
  limit 1;
$$;

comment on function public.get_public_request(uuid) is
  'Liefert genau eine Anfrage anhand ihres öffentlichen Tokens (Statusseite des Kunden, Baustein 2) — ohne Kunden-, Fremd- oder Mandantendaten anderer Personen.';

-- ----------------------------------------------------------------------------
-- 6. Ausführungsrechte
-- ----------------------------------------------------------------------------
-- Angemeldete Werkstatt-Benutzer: wie bisher.
grant execute on function public.get_public_request(uuid) to authenticated;

-- Nicht angemeldete Besucher: ausschließlich diese eng gefassten Funktionen.
-- Tabellenzugriff bleibt ihnen verwehrt (kein grant auf Tabellen!).
revoke all on function public.get_public_workshop(text) from public;
revoke all on function public.get_public_availabilities(text) from public;
revoke all on function public.get_public_busy_times(text, date, date) from public;
revoke all on function public.create_public_request(
  text, text, text, date, text, text, text, text, text, text,
  text, text, integer, integer, text, numeric, numeric, text
) from public;

grant execute on function public.get_public_workshop(text) to anon, authenticated;
grant execute on function public.get_public_availabilities(text) to anon, authenticated;
grant execute on function public.get_public_busy_times(text, date, date) to anon, authenticated;
grant execute on function public.get_public_request(uuid) to anon;
grant execute on function public.create_public_request(
  text, text, text, date, text, text, text, text, text, text,
  text, text, integer, integer, text, numeric, numeric, text
) to anon, authenticated;
