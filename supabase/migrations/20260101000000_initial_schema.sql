-- ============================================================================
-- WerkstattFlow — Migration 1/4: Datenbankschema
-- ============================================================================
-- Mandantenfähige Plattform für Termin- und Auftragsanfragen.
-- Erster Anwendungsfall: Kfz-Werkstatt.
--
-- Begriffe
--   Mandant / Unternehmen : eine Werkstatt. Alle Daten hängen über company_id
--                           an genau einem Mandanten.
--   Anfrage               : Termin-/Auftragsanfrage eines Kunden (Status neu,
--                           bestätigt, abgelehnt, abgeschlossen, storniert).
--
-- Konventionen
--   * Alle Tabellen liegen im Schema public und haben einen Primärschlüssel
--     vom Typ uuid (gen_random_uuid()).
--   * Jede Tabelle mit Unternehmensbezug hat eine Spalte company_id uuid
--     NOT NULL mit Fremdschlüssel auf public.companies. Das ist die Grundlage
--     der Row-Level-Security (siehe Migration 2).
--   * Statuswerte sind deutsche Textwerte mit CHECK-Constraint (statt
--     Postgres-Enums), damit spätere Migrationen sie einfach erweitern können.
--   * Zeitstempel: created_at / updated_at (timestamptz, Standard now()).
--     updated_at wird per Trigger automatisch gepflegt.
--   * Aufzählung der Wochentage: 1 = Montag ... 7 = Sonntag (ISO-8601).
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Hilfsfunktionen
-- ----------------------------------------------------------------------------

-- Hält updated_at automatisch aktuell (Trigger-Funktion, für alle Tabellen).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Setzt updated_at beim UPDATE automatisch auf now().';

-- ----------------------------------------------------------------------------
-- Sequenz für lesbare Anfrage-Nummern (z. B. ANF-2026-0001)
-- ----------------------------------------------------------------------------
create sequence if not exists public.request_reference_seq start 1;

-- ----------------------------------------------------------------------------
-- 1. companies — Mandanten (Werkstätten)
-- ----------------------------------------------------------------------------
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null,
  legal_name    text,
  email         text,
  phone         text,
  street        text,
  postal_code   text,
  city          text,
  country       text not null default 'DE',
  -- Akzentfarbe der Werkstatt (Oberfläche). Standard: Petrol.
  accent_color  text not null default '#0A6E78',
  timezone      text not null default 'Europe/Berlin',
  -- Länge eines Termin-Slots in Minuten (Grundlage für den Kundenkalender).
  slot_minutes  integer not null default 60,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint companies_slug_unique unique (slug),
  constraint companies_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint companies_slot_minutes_range check (slot_minutes between 15 and 480),
  constraint companies_email_format check (
    email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

comment on table public.companies is
  'Mandant der Plattform (eine Kfz-Werkstatt). Jede Zeile ist strikt von allen anderen Mandanten getrennt.';
comment on column public.companies.slug is
  'URL-tauglicher Kurzname, u. a. Basis für den öffentlichen Kunden-Link (Baustein 2/3).';
comment on column public.companies.accent_color is
  'Akzentfarbe der Werkstatt-Oberfläche als Hex-Wert. Standard Petrol #0A6E78.';

create index if not exists companies_is_active_idx on public.companies (is_active);

-- ----------------------------------------------------------------------------
-- 2. profiles — Werkstatt-Benutzer (verknüpft auth.users mit einem Mandanten)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  company_id   uuid not null references public.companies (id) on delete cascade,
  full_name    text,
  email        text,
  phone        text,
  role         text not null default 'inhaber',
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_role_check check (role in ('inhaber', 'mitarbeiter'))
);

comment on table public.profiles is
  'Werkstatt-Benutzer. Ein Datensatz pro Login (auth.users.id). company_id bestimmt, welchen Mandanten der Benutzer sieht.';
comment on column public.profiles.role is
  'inhaber = darf alles, mitarbeiter = eingeschränkte Rechte (Ausbau in Baustein 3).';

create index if not exists profiles_company_id_idx on public.profiles (company_id);

-- ----------------------------------------------------------------------------
-- 3. customers — Kunden der Werkstatt
-- ----------------------------------------------------------------------------
create table if not exists public.customers (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  first_name  text not null,
  last_name   text not null,
  email       text,
  phone       text,
  street      text,
  postal_code text,
  city        text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint customers_email_format check (
    email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

comment on table public.customers is
  'Kunden einer Werkstatt. E-Mail-Adresse ist pro Mandant eindeutig (Groß-/Kleinschreibung egal), damit eine Anfrage den Kunden wiederfindet.';

create index if not exists customers_company_id_idx on public.customers (company_id);
create index if not exists customers_company_name_idx
  on public.customers (company_id, last_name, first_name);
create unique index if not exists customers_company_email_key
  on public.customers (company_id, lower(email))
  where email is not null;
create index if not exists customers_company_phone_idx
  on public.customers (company_id, phone)
  where phone is not null;

-- ----------------------------------------------------------------------------
-- 4. vehicles — Fahrzeuge
-- ----------------------------------------------------------------------------
create table if not exists public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  customer_id  uuid not null references public.customers (id) on delete cascade,
  make         text not null,
  model        text not null,
  year         integer,
  license_plate text,
  vin          text,
  mileage_km   integer,
  fuel_type    text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint vehicles_year_range check (year is null or year between 1886 and 2100),
  constraint vehicles_mileage_non_negative check (mileage_km is null or mileage_km >= 0),
  constraint vehicles_fuel_type_check check (
    fuel_type is null
    or fuel_type in ('benzin', 'diesel', 'elektro', 'hybrid', 'gas', 'sonstiges')
  )
);

comment on table public.vehicles is
  'Fahrzeuge der Kunden. Ein Kunde kann mehrere Fahrzeuge haben.';
comment on column public.vehicles.license_plate is
  'Amtliches Kennzeichen, pro Mandant eindeutig (Groß-/Kleinschreibung egal) — dient als schnellster Weg, ein Fahrzeug wiederzufinden.';

create index if not exists vehicles_company_id_idx on public.vehicles (company_id);
create index if not exists vehicles_customer_id_idx on public.vehicles (customer_id);
create unique index if not exists vehicles_company_plate_key
  on public.vehicles (company_id, upper(license_plate))
  where license_plate is not null;
create index if not exists vehicles_company_vin_idx
  on public.vehicles (company_id, vin)
  where vin is not null;

-- ----------------------------------------------------------------------------
-- 5. requests — Anfragen (Termin- und Auftragsanfragen)
-- ----------------------------------------------------------------------------
create table if not exists public.requests (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete cascade,
  customer_id         uuid not null references public.customers (id) on delete cascade,
  vehicle_id          uuid references public.vehicles (id) on delete set null,
  -- Menschenlesbare Nummer für Telefon und E-Mail, z. B. ANF-2026-0001
  reference           text not null default (
                        'ANF-' || to_char(now(), 'YYYY') || '-' ||
                        lpad(nextval('public.request_reference_seq')::text, 4, '0')
                      ),
  -- Öffentlicher Zugangsschlüssel für die Statusseite des Kunden (Baustein 2).
  -- Bewusst zufällig und nicht erratbar; der Zugriff läuft NICHT über RLS,
  -- sondern ausschließlich über die Funktion public.get_public_request().
  public_token        uuid not null default gen_random_uuid(),
  status              text not null default 'neu',
  service_type        text not null,
  description         text,
  preferred_date_from date,
  preferred_date_to   date,
  preferred_time_note text,
  estimated_price_min numeric(10, 2),
  estimated_price_max numeric(10, 2),
  price_estimate_note text,
  contact_preference  text not null default 'email',
  source              text not null default 'online',
  staff_note          text,
  rejection_reason    text,
  decided_at          timestamptz,
  decided_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint requests_reference_key unique (reference),
  constraint requests_public_token_key unique (public_token),
  constraint requests_status_check check (
    status in ('neu', 'bestaetigt', 'abgelehnt', 'abgeschlossen', 'storniert')
  ),
  constraint requests_source_check check (
    source in ('online', 'telefon', 'vor_ort', 'sms_webhook')
  ),
  constraint requests_contact_preference_check check (
    contact_preference in ('email', 'telefon', 'sms')
  ),
  constraint requests_price_range_check check (
    estimated_price_min is null
    or estimated_price_max is null
    or estimated_price_min <= estimated_price_max
  ),
  constraint requests_prices_non_negative check (
    (estimated_price_min is null or estimated_price_min >= 0)
    and (estimated_price_max is null or estimated_price_max >= 0)
  ),
  constraint requests_date_range_check check (
    preferred_date_from is null
    or preferred_date_to is null
    or preferred_date_from <= preferred_date_to
  ),
  -- Entschieden heißt: Zeitpunkt gesetzt. Und umgekehrt.
  constraint requests_decided_at_check check (
    (status in ('bestaetigt', 'abgelehnt') and decided_at is not null)
    or (status in ('neu', 'abgeschlossen', 'storniert'))
  ),
  constraint requests_rejection_reason_check check (
    status <> 'abgelehnt' or (rejection_reason is not null and length(btrim(rejection_reason)) > 0)
  )
);

comment on table public.requests is
  'Termin-/Auftragsanfragen. Kernstück der Plattform: entstehen im Kundenportal (Baustein 2), werden im Werkstatt-Dashboard bearbeitet (Baustein 3).';
comment on column public.requests.public_token is
  'Geheimer Zugangsschlüssel für die öffentliche Statusseite des Kunden (Baustein 2). Nie im Klartext in Listen anzeigen.';
comment on column public.requests.status is
  'neu = eingegangen und unbearbeitet, bestaetigt = von der Werkstatt angenommen, abgelehnt = von der Werkstatt abgelehnt, abgeschlossen = erledigt, storniert = vom Kunden zurückgezogen.';

create index if not exists requests_company_id_idx on public.requests (company_id);
create index if not exists requests_company_status_idx on public.requests (company_id, status);
create index if not exists requests_company_created_at_idx
  on public.requests (company_id, created_at desc);
create index if not exists requests_customer_id_idx on public.requests (customer_id);
create index if not exists requests_vehicle_id_idx on public.requests (vehicle_id)
  where vehicle_id is not null;
-- Deckt die offene Inbox der Werkstatt ab (nur unbearbeitete Anfragen).
create index if not exists requests_company_open_idx
  on public.requests (company_id, created_at desc)
  where status = 'neu';

-- ----------------------------------------------------------------------------
-- 6. appointments — Termine
-- ----------------------------------------------------------------------------
create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  request_id    uuid references public.requests (id) on delete set null,
  customer_id   uuid not null references public.customers (id) on delete cascade,
  vehicle_id    uuid references public.vehicles (id) on delete set null,
  title         text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        text not null default 'geplant',
  bay           text,
  internal_note text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint appointments_period_check check (ends_at > starts_at),
  constraint appointments_status_check check (
    status in ('geplant', 'bestaetigt', 'abgeschlossen', 'abgesagt', 'nicht_erschienen')
  )
);

comment on table public.appointments is
  'Konkrete Termine im Kalender der Werkstatt. Entstehen, wenn die Werkstatt eine Anfrage bestätigt (Baustein 3).';
comment on column public.appointments.bay is
  'Arbeitsplatz / Hebebühne, frei wählbarer Text (z. B. "Bühne 1").';
-- Hinweis: Eine Überschneidungsprüfung pro Arbeitsplatz ist bewusst NICHT als
-- Exclusion-Constraint abgebildet (bräuchte die Erweiterung btree_gist) —
-- geplant als Prüfung in der Anwendungslogik, siehe Baustein 3.

create index if not exists appointments_company_id_idx on public.appointments (company_id);
create index if not exists appointments_company_start_idx
  on public.appointments (company_id, starts_at);
create index if not exists appointments_customer_id_idx on public.appointments (customer_id);
create index if not exists appointments_request_id_idx on public.appointments (request_id)
  where request_id is not null;
create unique index if not exists appointments_request_key
  on public.appointments (request_id)
  where request_id is not null;

-- ----------------------------------------------------------------------------
-- 7. files — Dateien (Fotos, Dokumente, Rechnungen in Supabase Storage)
-- ----------------------------------------------------------------------------
create table if not exists public.files (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies (id) on delete cascade,
  request_id         uuid references public.requests (id) on delete cascade,
  appointment_id     uuid references public.appointments (id) on delete cascade,
  vehicle_id         uuid references public.vehicles (id) on delete cascade,
  customer_id        uuid references public.customers (id) on delete cascade,
  uploaded_by        uuid references public.profiles (id) on delete set null,
  bucket_id          text not null default 'anfragen-dateien',
  storage_path       text not null,
  file_name          text not null,
  mime_type          text,
  size_bytes         bigint,
  kind               text not null default 'foto',
  is_customer_visible boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint files_size_non_negative check (size_bytes is null or size_bytes >= 0),
  constraint files_kind_check check (
    kind in ('foto', 'dokument', 'rechnung', 'gutachten', 'sonstiges')
  ),
  constraint files_has_reference check (
    request_id is not null
    or appointment_id is not null
    or vehicle_id is not null
    or customer_id is not null
  ),
  constraint files_bucket_path_key unique (bucket_id, storage_path)
);

comment on table public.files is
  'Metadaten der Dateien; die Binärdaten liegen in Supabase Storage. Konvention für den Pfad: "<company_id>/<anfrage|termin|fahrzeug>/<datei>" — daran hängt auch die Storage-Policy (Migration 4).';
comment on column public.files.is_customer_visible is
  'true = Datei darf der Kunde auf seiner Statusseite sehen (Baustein 2).';

create index if not exists files_company_id_idx on public.files (company_id);
create index if not exists files_request_id_idx on public.files (request_id)
  where request_id is not null;
create index if not exists files_appointment_id_idx on public.files (appointment_id)
  where appointment_id is not null;
create index if not exists files_vehicle_id_idx on public.files (vehicle_id)
  where vehicle_id is not null;
create index if not exists files_customer_id_idx on public.files (customer_id)
  where customer_id is not null;

-- ----------------------------------------------------------------------------
-- 8. availabilities — Verfügbarkeiten / Öffnungszeiten
-- ----------------------------------------------------------------------------
-- Pro Werkstatt pflegbar (Baustein 2/3). Zwei Arten von Zeilen:
--   * wiederkehrend : weekday gesetzt  (1 = Montag ... 7 = Sonntag)
--   * Ausnahme      : specific_date gesetzt (z. B. Betriebsferien, Brückentag)
-- Genau eines von beiden ist gesetzt.
create table if not exists public.availabilities (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  weekday       smallint,
  specific_date date,
  is_closed     boolean not null default false,
  open_time     time,
  close_time    time,
  slot_minutes  integer,
  capacity      smallint not null default 1,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint availabilities_scope_check check ((weekday is null) <> (specific_date is null)),
  constraint availabilities_weekday_range check (weekday is null or weekday between 1 and 7),
  constraint availabilities_times_check check (
    (is_closed and open_time is null and close_time is null)
    or (not is_closed and open_time is not null and close_time is not null and close_time > open_time)
  ),
  constraint availabilities_slot_minutes_range check (
    slot_minutes is null or slot_minutes between 15 and 480
  ),
  constraint availabilities_capacity_range check (capacity between 1 and 20)
);

comment on table public.availabilities is
  'Öffnungszeiten und Verfügbarkeiten je Werkstatt. weekday (1=Mo) = wiederkehrende Regel, specific_date = konkrete Ausnahme (z. B. Betriebsferien).';
comment on column public.availabilities.capacity is
  'Wie viele Fahrzeuge gleichzeitig angenommen werden können — Grundlage für freie Tage im Kundenkalender (Baustein 2).';

create index if not exists availabilities_company_id_idx on public.availabilities (company_id);
create unique index if not exists availabilities_company_weekday_key
  on public.availabilities (company_id, weekday)
  where weekday is not null;
create unique index if not exists availabilities_company_date_key
  on public.availabilities (company_id, specific_date)
  where specific_date is not null;

-- ----------------------------------------------------------------------------
-- updated_at-Trigger für alle Tabellen
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'profiles', 'customers', 'vehicles',
    'requests', 'appointments', 'files', 'availabilities'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;
