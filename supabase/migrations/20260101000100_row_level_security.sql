-- ============================================================================
-- WerkstattFlow — Migration 2/4: Row Level Security (Mandanten-Trennung)
-- ============================================================================
-- Ziel: Ein eingeloggter Werkstatt-Benutzer sieht und ändert AUSSCHLIESSLICH
--       Datensätze seines eigenen Unternehmens (company_id). Kein Mandant darf
--       jemals Daten eines anderen Mandanten lesen oder schreiben.
--
-- Vorgehen
--   1. RLS auf jeder Tabelle aktivieren (ENABLE ROW LEVEL SECURITY).
--   2. Eine Hilfsfunktion public.current_company_id() liefert das Unternehmen
--      des angemeldeten Benutzers. Sie ist SECURITY DEFINER, damit sie beim
--      Lesen von public.profiles nicht selbst an der RLS scheitert
--      (kein Rekursionsproblem).
--   3. Pro Tabelle vier Policies (SELECT / INSERT / UPDATE / DELETE), jeweils
--      auf die Rolle "authenticated" beschränkt und mit der Bedingung
--      company_id = public.current_company_id().
--   4. Die Rolle "anon" (nicht angemeldet) bekommt KEINEN Tabellenzugriff.
--
-- Ohne Unternehmen (current_company_id() = null) liefert jede Bedingung false —
-- ein Benutzer ohne Profile-Datensatz sieht also gar nichts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Hilfsfunktionen
-- ----------------------------------------------------------------------------

-- Das Unternehmen des angemeldeten Benutzers.
create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

comment on function public.current_company_id() is
  'Unternehmen (Mandant) des angemeldeten Benutzers. Grundlage aller RLS-Policies. SECURITY DEFINER, damit die Funktion profiles ohne RLS-Rekursion lesen kann.';

-- Die Rolle des angemeldeten Benutzers innerhalb seiner Werkstatt.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

comment on function public.current_user_role() is
  'inhaber | mitarbeiter des angemeldeten Benutzers (null, wenn kein Profil existiert).';

-- Ist der angemeldete Benutzer Inhaber seiner Werkstatt?
create or replace function public.is_company_owner()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select coalesce((select role = 'inhaber' from public.profiles where id = auth.uid()), false);
$$;

comment on function public.is_company_owner() is
  'true, wenn der angemeldete Benutzer Inhaber seiner Werkstatt ist.';

-- ----------------------------------------------------------------------------
-- RLS einschalten
-- ----------------------------------------------------------------------------
alter table public.companies      enable row level security;
alter table public.profiles       enable row level security;
alter table public.customers      enable row level security;
alter table public.vehicles       enable row level security;
alter table public.requests       enable row level security;
alter table public.appointments   enable row level security;
alter table public.files          enable row level security;
alter table public.availabilities enable row level security;

-- ----------------------------------------------------------------------------
-- companies
-- ----------------------------------------------------------------------------
-- Die eigene Werkstatt lesen und ihre Stammdaten (Name, Öffnungszeiten-Feinschliff,
-- Akzentfarbe ...) ändern. Neue Unternehmen entstehen ausschließlich über die
-- Registrierung (Migration 3, SECURITY DEFINER) — nicht direkt durch Clients.
drop policy if exists companies_select_own on public.companies;
create policy companies_select_own on public.companies
  for select to authenticated
  using (id = public.current_company_id());

drop policy if exists companies_update_own on public.companies;
create policy companies_update_own on public.companies
  for update to authenticated
  using (id = public.current_company_id())
  with check (id = public.current_company_id());

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select_own_company on public.profiles;
create policy profiles_select_own_company on public.profiles
  for select to authenticated
  using (company_id = public.current_company_id() or id = auth.uid());

-- Ein neues Profil darf nur für sich selbst und nur im eigenen Unternehmen
-- angelegt werden. (Die Registrierung selbst läuft über den Trigger in
-- Migration 3 und umgeht die RLS kontrolliert.)
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and company_id = public.current_company_id());

drop policy if exists profiles_update_own_company on public.profiles;
create policy profiles_update_own_company on public.profiles
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- Kollegen dürfen entfernt werden, aber niemand sich selbst.
drop policy if exists profiles_delete_own_company on public.profiles;
create policy profiles_delete_own_company on public.profiles
  for delete to authenticated
  using (company_id = public.current_company_id() and id <> auth.uid());

-- ----------------------------------------------------------------------------
-- customers
-- ----------------------------------------------------------------------------
drop policy if exists customers_select_own_company on public.customers;
create policy customers_select_own_company on public.customers
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists customers_insert_own_company on public.customers;
create policy customers_insert_own_company on public.customers
  for insert to authenticated
  with check (company_id = public.current_company_id());

drop policy if exists customers_update_own_company on public.customers;
create policy customers_update_own_company on public.customers
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists customers_delete_own_company on public.customers;
create policy customers_delete_own_company on public.customers
  for delete to authenticated
  using (company_id = public.current_company_id());

-- ----------------------------------------------------------------------------
-- vehicles
-- ----------------------------------------------------------------------------
drop policy if exists vehicles_select_own_company on public.vehicles;
create policy vehicles_select_own_company on public.vehicles
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists vehicles_insert_own_company on public.vehicles;
create policy vehicles_insert_own_company on public.vehicles
  for insert to authenticated
  with check (company_id = public.current_company_id());

drop policy if exists vehicles_update_own_company on public.vehicles;
create policy vehicles_update_own_company on public.vehicles
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists vehicles_delete_own_company on public.vehicles;
create policy vehicles_delete_own_company on public.vehicles
  for delete to authenticated
  using (company_id = public.current_company_id());

-- ----------------------------------------------------------------------------
-- requests
-- ----------------------------------------------------------------------------
drop policy if exists requests_select_own_company on public.requests;
create policy requests_select_own_company on public.requests
  for select to authenticated
  using (company_id = public.current_company_id());

-- Anfragen dürfen nur im eigenen Unternehmen angelegt werden. Das Kundenportal
-- (Baustein 2) nutzt dafür einen separaten, eng begrenzten Serverpfad — nicht
-- diese Policy.
drop policy if exists requests_insert_own_company on public.requests;
create policy requests_insert_own_company on public.requests
  for insert to authenticated
  with check (company_id = public.current_company_id());

drop policy if exists requests_update_own_company on public.requests;
create policy requests_update_own_company on public.requests
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists requests_delete_own_company on public.requests;
create policy requests_delete_own_company on public.requests
  for delete to authenticated
  using (company_id = public.current_company_id());

-- ----------------------------------------------------------------------------
-- appointments
-- ----------------------------------------------------------------------------
drop policy if exists appointments_select_own_company on public.appointments;
create policy appointments_select_own_company on public.appointments
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists appointments_insert_own_company on public.appointments;
create policy appointments_insert_own_company on public.appointments
  for insert to authenticated
  with check (company_id = public.current_company_id());

drop policy if exists appointments_update_own_company on public.appointments;
create policy appointments_update_own_company on public.appointments
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists appointments_delete_own_company on public.appointments;
create policy appointments_delete_own_company on public.appointments
  for delete to authenticated
  using (company_id = public.current_company_id());

-- ----------------------------------------------------------------------------
-- files
-- ----------------------------------------------------------------------------
drop policy if exists files_select_own_company on public.files;
create policy files_select_own_company on public.files
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists files_insert_own_company on public.files;
create policy files_insert_own_company on public.files
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and (uploaded_by is null or uploaded_by = auth.uid())
  );

drop policy if exists files_update_own_company on public.files;
create policy files_update_own_company on public.files
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists files_delete_own_company on public.files;
create policy files_delete_own_company on public.files
  for delete to authenticated
  using (company_id = public.current_company_id());

-- ----------------------------------------------------------------------------
-- availabilities
-- ----------------------------------------------------------------------------
drop policy if exists availabilities_select_own_company on public.availabilities;
create policy availabilities_select_own_company on public.availabilities
  for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists availabilities_insert_own_company on public.availabilities;
create policy availabilities_insert_own_company on public.availabilities
  for insert to authenticated
  with check (company_id = public.current_company_id());

drop policy if exists availabilities_update_own_company on public.availabilities;
create policy availabilities_update_own_company on public.availabilities
  for update to authenticated
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

drop policy if exists availabilities_delete_own_company on public.availabilities;
create policy availabilities_delete_own_company on public.availabilities
  for delete to authenticated
  using (company_id = public.current_company_id());

-- ----------------------------------------------------------------------------
-- Öffentlicher Statuszugang für den Kunden (Vorbereitung Baustein 2)
-- ----------------------------------------------------------------------------
-- Der Kunde kennt nur seinen zufälligen Token aus der Bestätigungs-E-Mail. Er
-- bekommt genau EINE Anfrage mit ausgewählten Feldern zurück — und keinerlei
-- Zugriff auf Kunden-, Fahrzeug- oder Werkstattdaten. Deshalb bewusst KEINE
-- anon-Policy auf public.requests (die würde bei fehlendem Filter alle Zeilen
-- freigeben), sondern diese eng gefasste Funktion.
create or replace function public.get_public_request(p_token uuid)
returns table (
  reference           text,
  status              text,
  service_type        text,
  description         text,
  preferred_date_from date,
  preferred_date_to   date,
  estimated_price_min numeric,
  estimated_price_max numeric,
  price_estimate_note text,
  rejection_reason    text,
  workshop_name       text,
  workshop_phone      text,
  created_at          timestamptz,
  updated_at          timestamptz,
  decided_at          timestamptz
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
    r.estimated_price_min,
    r.estimated_price_max,
    r.price_estimate_note,
    r.rejection_reason,
    c.name,
    c.phone,
    r.created_at,
    r.updated_at,
    r.decided_at
  from public.requests r
  join public.companies c on c.id = r.company_id
  where r.public_token = p_token;
$$;

comment on function public.get_public_request(uuid) is
  'Liefert genau eine Anfrage anhand ihres öffentlichen Tokens, ohne Mandantendaten preiszugeben. Vorgesehener Zugangsweg für die Statusseite des Kunden (Baustein 2).';

-- ----------------------------------------------------------------------------
-- Rechte
-- ----------------------------------------------------------------------------
-- Angemeldete Benutzer dürfen die Tabellen benutzen — WELCHE Zeilen sie sehen,
-- entscheidet ausschließlich die RLS oben.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.current_company_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_company_owner() to authenticated;

-- Nicht angemeldete Besucher: kein Tabellenzugriff, nur der Token-Zugang.
revoke all on all tables in schema public from anon;
grant execute on function public.get_public_request(uuid) to anon, authenticated;
