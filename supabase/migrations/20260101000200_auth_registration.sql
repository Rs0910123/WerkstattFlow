-- ============================================================================
-- WerkstattFlow — Migration 3/4: Registrierung und automatische Mandantenanlage
-- ============================================================================
-- Bei der Registrierung über Supabase Auth (supabase.auth.signUp mit
-- options.data = { company_name, full_name, company_slug? }) legt dieser Trigger
-- automatisch an:
--   1. ein Unternehmen (Mandant) mit eindeutigem Slug,
--   2. den zugehörigen Benutzer-Datensatz in public.profiles (Rolle "inhaber"),
--   3. Standard-Öffnungszeiten Montag–Freitag 08:00–17:00.
--
-- Ablauf im Client (src/app/(auth)/registrieren → src/lib/actions/auth.ts):
--   supabase.auth.signUp({ email, password, options: { data: { company_name, full_name } } })
--
-- Hinweis: Die Trigger-Funktion ist SECURITY DEFINER und gehört dem Eigentümer
-- der Tabellen. Sie darf die RLS-Policies bewusst umgehen, damit genau dieser
-- eine kontrollierte Anlageweg möglich ist — ohne dass Clients selbst
-- Unternehmen oder fremde Profile schreiben können.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Slug-Erzeugung: "Kfz-Werkstatt Müller & Söhne" -> "kfz-werkstatt-mueller-soehne"
-- ----------------------------------------------------------------------------
create or replace function public.slugify(p_text text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    nullif(
      btrim(
        regexp_replace(
          translate(
            lower(replace(coalesce(p_text, ''), 'ß', 'ss')),
            'äöü',
            'aou'
          ),
          '[^a-z0-9]+',
          '-',
          'g'
        ),
        '-'
      ),
      ''
    ),
    'werkstatt'
  );
$$;

comment on function public.slugify(text) is
  'Macht aus einem Firmennamen einen URL-tauglichen Slug (Umlaute werden umgeschrieben, Sonderzeichen zu Bindestrichen).';

-- ----------------------------------------------------------------------------
-- Trigger-Funktion: neuer Auth-Benutzer -> Unternehmen + Profil + Zeiten
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_company_name text;
  v_company_slug text;
  v_full_name    text;
  v_company_id   uuid;
begin
  -- Ohne E-Mail-Adresse (z. B. reine Telefon-Anmeldung) gibt es keine Werkstatt
  -- anzulegen; der Trigger tut dann nichts.
  if new.email is null then
    return new;
  end if;

  v_company_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'company_name', '')), '');
  if v_company_name is null then
    v_company_name := 'Werkstatt ' || split_part(new.email, '@', 1);
  end if;

  v_full_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');

  v_company_slug := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'company_slug', '')), '');
  if v_company_slug is null then
    v_company_slug := public.slugify(v_company_name);
  end if;

  -- Slug muss eindeutig sein; bei Kollision mit kurzem Zufallssuffix ergänzen.
  if exists (select 1 from public.companies c where c.slug = v_company_slug) then
    v_company_slug := v_company_slug || '-' || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;

  insert into public.companies (name, slug, email)
  values (v_company_name, v_company_slug, new.email)
  returning id into v_company_id;

  insert into public.profiles (id, company_id, full_name, email, role)
  values (new.id, v_company_id, v_full_name, new.email, 'inhaber')
  on conflict (id) do nothing;

  -- Standard-Öffnungszeiten: Montag (1) bis Freitag (5) 08:00–17:00 Uhr,
  -- Samstag (6) und Sonntag (7) geschlossen. In Baustein 3 in den
  -- Einstellungen änderbar.
  insert into public.availabilities (company_id, weekday, is_closed, open_time, close_time)
  select
    v_company_id,
    d::smallint,
    d > 5,
    case when d > 5 then null else time '08:00' end,
    case when d > 5 then null else time '17:00' end
  from generate_series(1, 7) as d
  on conflict do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Legt bei der Registrierung automatisch das Unternehmen, das Inhaber-Profil und Standard-Öffnungszeiten an.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
