-- ============================================================================
-- WerkstattFlow — RLS-Prüfung zum Selbernachsehen
-- ============================================================================
-- Diese Datei ist für den Supabase-SQL-Editor gedacht (oder für psql).
-- Sie ändert nichts, sie liest nur. Voraussetzung: die Migrationen und
-- supabase/seed.sql sind eingespielt (also die Demo-Werkstätten existieren).
--
-- Automatisiert und mit Fehlercode läuft dieselbe Prüfung über:
--     bash scripts/rls-check.sh
--
-- So funktioniert die Prüfung:
--   1. Als Werkstatt 1 anmelden, indem die JWT-Claims der Sitzung gesetzt und
--      die Rolle "authenticated" gesetzt werden. Genau so sieht die Datenbank
--      einen angemeldeten Supabase-Benutzer.
--   2. Zählen, was sichtbar ist — und was sichtbar sein MÜSSTE, wenn die
--      Trennung nicht funktioniert.
--   3. Dasselbe für Werkstatt 2 und für einen nicht angemeldeten Besucher.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Runde 0: Ausgangslage als Eigentümer der Tabellen (ohne RLS-Beschränkung).
-- Hier muss die Gesamtzahl stehen — sonst fehlen die Demo-Daten.
-- ---------------------------------------------------------------------------
select
  'Ausgangslage: alle Kunden (2 Mandanten)' as pruefung,
  7::text                                    as erwartet,
  count(*)::text                             as ergebnis
from public.customers;

select
  'Ausgangslage: alle Anfragen (2 Mandanten)' as pruefung,
  6::text                                     as erwartet,
  count(*)::text                              as ergebnis
from public.requests;

select
  'Ausgangslage: alle Unternehmen' as pruefung,
  2::text                          as erwartet,
  count(*)::text                   as ergebnis
from public.companies;

-- ---------------------------------------------------------------------------
-- Runde 1: Werkstatt 1 — "Kfz-Werkstatt Berger" (demo@kfz-berger.de)
-- ---------------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select id::text from auth.users where email = 'demo@kfz-berger.de'),
    'role', 'authenticated'
  )::text,
  false
);

set role authenticated;

-- Erwartet: 5 — nur die eigenen Kunden.
select 'W1 sieht nur eigene Kunden' as pruefung, '5' as erwartet,
       count(*)::text as ergebnis from public.customers;

-- Erwartet: 4 — nur die eigenen Fahrzeuge.
select 'W1 sieht nur eigene Fahrzeuge' as pruefung, '4' as erwartet,
       count(*)::text as ergebnis from public.vehicles;

-- Erwartet: 5 — nur die eigenen Anfragen.
select 'W1 sieht nur eigene Anfragen' as pruefung, '5' as erwartet,
       count(*)::text as ergebnis from public.requests;

-- Erwartet: 3 — nur die eigenen Termine.
select 'W1 sieht nur eigene Termine' as pruefung, '3' as erwartet,
       count(*)::text as ergebnis from public.appointments;

-- Erwartet: 9 — nur die eigenen Verfügbarkeiten (7 Wochentage + 2 Ausnahmen).
select 'W1 sieht nur eigene Verfuegbarkeiten' as pruefung, '9' as erwartet,
       count(*)::text as ergebnis from public.availabilities;

-- Erwartet: 1 — nur das eigene Unternehmen, mit dem richtigen Slug.
select 'W1 sieht nur das eigene Unternehmen' as pruefung,
       'kfz-werkstatt-berger' as erwartet,
       coalesce(string_agg(slug, ','), '(keine)') as ergebnis
from public.companies;

-- Erwartet: 0 — die Anfrage von Mandant 2 ist per ID unerreichbar
-- (ffffffff-0000-4000-8000-000000000001 = "E-Bike Inspektion").
select 'Anfrage von Mandant 2 per ID unsichtbar' as pruefung, '0' as erwartet,
       count(*)::text as ergebnis
from public.requests
where id = 'ffffffff-0000-4000-8000-000000000001';

-- Erwartet: 0 — Kunde von Mandant 2 ist unerreichbar.
select 'Kunde von Mandant 2 unsichtbar' as pruefung, '0' as erwartet,
       count(*)::text as ergebnis
from public.customers
where company_id = (select id from public.companies where slug = 'zweirad-technik-nord');

-- Erwartet: 0 — UPDATE auf die fremde Anfrage trifft keine Zeile.
with geaendert as (
  update public.requests set status = 'storniert'
  where id = 'ffffffff-0000-4000-8000-000000000001'
  returning 1
)
select 'UPDATE auf fremde Anfrage wirkt nicht' as pruefung, '0' as erwartet,
       count(*)::text as ergebnis from geaendert;

-- Erwartet: 1 — die eigene Anfrage darf geändert werden (Gegenprobe,
-- damit die Prüfung nicht deshalb "passt", weil gar nichts geht).
with geaendert as (
  update public.requests set staff_note = 'Rückruf erledigt'
  where id = 'eeeeeeee-0000-4000-8000-000000000001'
  returning 1
)
select 'Eigene Anfrage aendern funktioniert' as pruefung, '1' as erwartet,
       count(*)::text as ergebnis from geaendert;

-- Erwartet: FEHLER "new row violates row-level security policy".
-- (Bewusst als Einzelbefehl lassen und die Fehlermeldung zur Kenntnis nehmen.)
-- insert into public.customers (company_id, first_name, last_name)
-- values ((select id from public.companies where slug = 'zweirad-technik-nord'),
--         'Fremd', 'Kunde');

-- Erwartet: FEHLER "new row violates row-level security policy".
-- update public.requests
--    set company_id = (select id from public.companies where slug = 'zweirad-technik-nord')
--  where id = 'eeeeeeee-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Runde 2: Werkstatt 2 — "Zweirad Technik Nord" (demo@zweirad-nord.de)
-- ---------------------------------------------------------------------------
reset role;

select set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (select id::text from auth.users where email = 'demo@zweirad-nord.de'),
    'role', 'authenticated'
  )::text,
  false
);

set role authenticated;

-- Erwartet: 2 — nur die eigenen Kunden (Gesamtzahl wäre 7).
select 'W2 sieht nur eigene Kunden' as pruefung, '2' as erwartet,
       count(*)::text as ergebnis from public.customers;

-- Erwartet: 1 — nur die eigene Anfrage (Gesamtzahl wäre 6).
select 'W2 sieht nur eigene Anfragen' as pruefung, '1' as erwartet,
       count(*)::text as ergebnis from public.requests;

-- Erwartet: zweirad-technik-nord
select 'W2 sieht nur das eigene Unternehmen' as pruefung,
       'zweirad-technik-nord' as erwartet,
       coalesce(string_agg(slug, ','), '(keine)') as ergebnis
from public.companies;

-- Erwartet: 0 — die Anfrage von Mandant 1 ist unerreichbar.
select 'Anfrage von Mandant 1 unsichtbar' as pruefung, '0' as erwartet,
       count(*)::text as ergebnis
from public.requests
where id = 'eeeeeeee-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Runde 3: nicht angemeldeter Besucher (anon)
-- ---------------------------------------------------------------------------
reset role;

set role anon;

-- Erwartet: FEHLER "permission denied for table customers" —
-- nicht angemeldete Besucher haben keinen Tabellenzugriff.
-- select count(*) from public.customers;

-- Erwartet: 1 — der Kunde kommt ausschließlich über seinen geheimen Token an
-- genau seine Anfrage. Der Token steht nach dem Seed in der Tabelle; hier wird
-- er exemplarisch eingesetzt.
select 'Statusabfrage per Token funktioniert' as pruefung, '1' as erwartet,
       count(*)::text as ergebnis
from public.get_public_request(
  (select public_token from public.requests where id = 'ffffffff-0000-4000-8000-000000000001')
);

-- Erwartet: 0 — mit geratenem Token gibt es nichts.
select 'Statusabfrage mit unbekanntem Token leer' as pruefung, '0' as erwartet,
       count(*)::text as ergebnis
from public.get_public_request('00000000-0000-4000-8000-000000000099');

reset role;

-- ============================================================================
-- Erwartetes Gesamtergebnis: Alle "ergebnis"-Werte entsprechen "erwartet".
-- Abweichungen bedeuten: Mandanten-Trennung ist verletzt → nicht deployen.
-- ============================================================================
