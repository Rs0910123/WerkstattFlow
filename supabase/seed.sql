-- ============================================================================
-- WerkstattFlow — Demo-Daten (Seed)
-- ============================================================================
-- Legt an:
--   * Mandant 1 "Kfz-Werkstatt Berger"  — die Beispiel-Werkstatt mit Login,
--     Kunden, Fahrzeugen, Verfügbarkeiten, Anfragen in verschiedenen Status,
--     Terminen und Datei-Metadaten.
--   * Mandant 2 "Zweirad Technik Nord"  — ein zweiter, unabhängiger Mandant.
--     Er dient als Nachweis der Mandanten-Trennung: Mandant 1 darf dessen
--     Daten NIEMALS sehen (siehe supabase/tests/rls_isolation_test.sql).
--
-- Ausführen:
--   * Supabase lokal :  supabase db reset        (spielt Migrationen + seed ein)
--   * Supabase Cloud :  SQL-Editor öffnen und diese Datei einfügen/ausführen
--
-- Das Skript ist wiederholbar: vorhandene Demo-Mandanten werden zuerst
-- entfernt, danach identisch neu angelegt.
--
-- Demo-Login (siehe README):
--   Kfz-Werkstatt Berger : demo@kfz-berger.de   / Werkstatt2026!
--   Zweirad Technik Nord : demo@zweirad-nord.de / Werkstatt2026!
-- ============================================================================

create extension if not exists pgcrypto;

do $seed$
declare
  -- Feste IDs, damit ein erneuter Lauf exakt dieselben Daten erzeugt.
  v_user_a        uuid := '11111111-1111-4111-8111-111111111111';
  v_user_a2       uuid := '11111111-1111-4111-8111-222222222222'; -- Mitarbeiterin
  v_user_b        uuid := '22222222-2222-4222-8222-222222222222';
  v_company_a     uuid;
  v_company_b     uuid;
  v_pw            text := 'Werkstatt2026!';

  -- Kunden der Beispiel-Werkstatt
  c1 uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  c2 uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  c3 uuid := 'aaaaaaaa-0000-4000-8000-000000000003';
  c4 uuid := 'aaaaaaaa-0000-4000-8000-000000000004';
  c5 uuid := 'aaaaaaaa-0000-4000-8000-000000000005';

  -- Kunden des zweiten Mandanten
  cb1 uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  cb2 uuid := 'bbbbbbbb-0000-4000-8000-000000000002';

  -- Fahrzeuge
  v1 uuid := 'cccccccc-0000-4000-8000-000000000001';
  v2 uuid := 'cccccccc-0000-4000-8000-000000000002';
  v3 uuid := 'cccccccc-0000-4000-8000-000000000003';
  v4 uuid := 'cccccccc-0000-4000-8000-000000000004';
  vb1 uuid := 'dddddddd-0000-4000-8000-000000000001';

  -- Anfragen
  r1 uuid := 'eeeeeeee-0000-4000-8000-000000000001';
  r2 uuid := 'eeeeeeee-0000-4000-8000-000000000002';
  r3 uuid := 'eeeeeeee-0000-4000-8000-000000000003';
  r4 uuid := 'eeeeeeee-0000-4000-8000-000000000004';
  r5 uuid := 'eeeeeeee-0000-4000-8000-000000000005';
  rb1 uuid := 'ffffffff-0000-4000-8000-000000000001';
begin
  -- --------------------------------------------------------------------------
  -- 0. Aufräumen: alte Demo-Daten entfernen (macht das Skript wiederholbar)
  -- --------------------------------------------------------------------------
  delete from auth.users
   where email in ('demo@kfz-berger.de', 'anna.keller@kfz-berger.de', 'demo@zweirad-nord.de');
  delete from public.companies
   where slug like 'kfz-werkstatt-berger%'
      or slug like 'zweirad-technik-nord%';

  -- --------------------------------------------------------------------------
  -- 1. Auth-Benutzer anlegen. Der Trigger public.handle_new_user() erzeugt
  --    daraus automatisch Unternehmen, Inhaber-Profil und Standard-Zeiten.
  -- --------------------------------------------------------------------------
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  values
    (
      '00000000-0000-0000-0000-000000000000', v_user_a, 'authenticated', 'authenticated',
      'demo@kfz-berger.de', crypt(v_pw, gen_salt('bf')), now() - interval '180 days',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'company_name', 'Kfz-Werkstatt Berger',
        'company_slug', 'kfz-werkstatt-berger',
        'full_name', 'Martin Berger'
      ),
      now() - interval '180 days', now() - interval '2 days', '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_user_a2, 'authenticated', 'authenticated',
      'anna.keller@kfz-berger.de', crypt(v_pw, gen_salt('bf')), now() - interval '90 days',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'company_name', 'Kfz-Werkstatt Berger Zweitaccount',
        'company_slug', 'kfz-werkstatt-berger-zweitaccount',
        'full_name', 'Anna Keller'
      ),
      now() - interval '90 days', now() - interval '3 days', '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', v_user_b, 'authenticated', 'authenticated',
      'demo@zweirad-nord.de', crypt(v_pw, gen_salt('bf')), now() - interval '60 days',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'company_name', 'Zweirad Technik Nord',
        'company_slug', 'zweirad-technik-nord',
        'full_name', 'Sven Ohlsen'
      ),
      now() - interval '60 days', now() - interval '1 day', '', '', '', ''
    );

  -- Passende Identities, damit die Passwort-Anmeldung sicher funktioniert.
  -- (provider_id gibt es erst in neueren Supabase-Versionen.)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
  ) then
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values
      (gen_random_uuid(), v_user_a::text,  v_user_a,  jsonb_build_object('sub', v_user_a::text,  'email', 'demo@kfz-berger.de',     'email_verified', true), 'email', now() - interval '2 days', now() - interval '180 days', now()),
      (gen_random_uuid(), v_user_a2::text, v_user_a2, jsonb_build_object('sub', v_user_a2::text, 'email', 'anna.keller@kfz-berger.de', 'email_verified', true), 'email', now() - interval '3 days', now() - interval '90 days',  now()),
      (gen_random_uuid(), v_user_b::text,  v_user_b,  jsonb_build_object('sub', v_user_b::text,  'email', 'demo@zweirad-nord.de',   'email_verified', true), 'email', now() - interval '1 day',  now() - interval '60 days',  now());
  else
    insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values
      (gen_random_uuid(), v_user_a,  jsonb_build_object('sub', v_user_a::text,  'email', 'demo@kfz-berger.de',     'email_verified', true), 'email', now() - interval '2 days', now() - interval '180 days', now()),
      (gen_random_uuid(), v_user_a2, jsonb_build_object('sub', v_user_a2::text, 'email', 'anna.keller@kfz-berger.de', 'email_verified', true), 'email', now() - interval '3 days', now() - interval '90 days',  now()),
      (gen_random_uuid(), v_user_b,  jsonb_build_object('sub', v_user_b::text,  'email', 'demo@zweirad-nord.de',   'email_verified', true), 'email', now() - interval '1 day',  now() - interval '60 days',  now());
  end if;

  -- --------------------------------------------------------------------------
  -- 2. IDs der automatisch angelegten Unternehmen holen
  -- --------------------------------------------------------------------------
  select id into v_company_a from public.companies where slug = 'kfz-werkstatt-berger';
  select id into v_company_b from public.companies where slug = 'zweirad-technik-nord';

  if v_company_a is null or v_company_b is null then
    raise exception 'Seed fehlgeschlagen: Der Registrierungs-Trigger hat die Demo-Unternehmen nicht angelegt.';
  end if;

  -- Der Zweitaccount (Mitarbeiterin) gehört zur selben Werkstatt wie der
  -- Hauptaccount: Profil umhängen und die dabei vom Trigger angelegte
  -- Hilfs-Firma wieder entfernen. Im echten Betrieb entstehen Mitarbeiter-
  -- Konten stattdessen über eine Einladung im Dashboard (Baustein 3).
  update public.profiles
     set company_id = v_company_a, role = 'mitarbeiter', phone = '+49 711 45678-22'
   where id = v_user_a2;
  delete from public.companies where slug like 'kfz-werkstatt-berger-zweitaccount%';

  -- --------------------------------------------------------------------------
  -- 3. Stammdaten der Beispiel-Werkstatt
  -- --------------------------------------------------------------------------
  update public.companies
     set legal_name   = 'Kfz-Werkstatt Berger GmbH',
         email        = 'werkstatt@kfz-berger.de',
         phone        = '+49 711 45678-0',
         street       = 'Industriestraße 42',
         postal_code  = '70565',
         city         = 'Stuttgart',
         accent_color = '#0A6E78',
         slot_minutes = 60
   where id = v_company_a;

  update public.companies
     set legal_name   = 'Zweirad Technik Nord GmbH',
         email        = 'kontakt@zweirad-nord.de',
         phone        = '+49 40 99887-0',
         street       = 'Hafenweg 7',
         postal_code  = '20457',
         city         = 'Hamburg',
         accent_color = '#1E3A8A',
         slot_minutes = 45
   where id = v_company_b;

  update public.profiles
     set full_name = 'Martin Berger', role = 'inhaber', phone = '+49 711 45678-11'
   where id = v_user_a;

  -- --------------------------------------------------------------------------
  -- 4. Verfügbarkeiten der Beispiel-Werkstatt
  --    (die vom Trigger angelegten Standardzeiten werden ersetzt)
  -- --------------------------------------------------------------------------
  delete from public.availabilities where company_id = v_company_a;

  insert into public.availabilities (company_id, weekday, is_closed, open_time, close_time, slot_minutes, capacity, note)
  values
    (v_company_a, 1, false, time '07:30', time '17:00', 60, 2, 'Werkstatt und Annahme'),
    (v_company_a, 2, false, time '07:30', time '17:00', 60, 2, 'Werkstatt und Annahme'),
    (v_company_a, 3, false, time '07:30', time '17:00', 60, 2, 'Werkstatt und Annahme'),
    (v_company_a, 4, false, time '07:30', time '17:00', 60, 2, 'Werkstatt und Annahme'),
    (v_company_a, 5, false, time '07:30', time '15:00', 60, 1, 'Freitag nur bis 15 Uhr'),
    (v_company_a, 6, false, time '09:00', time '12:00', 30, 1, 'Samstags nur Annahme'),
    (v_company_a, 7, true,  null, null, null, 1, 'Sonntag geschlossen');

  -- Konkrete Ausnahmen (Betriebsferien / Brückentag) — relativ zum laufenden Jahr.
  insert into public.availabilities (company_id, specific_date, is_closed, capacity, note)
  values
    (v_company_a, (date_trunc('year', now()) + interval '11 months' + interval '23 days')::date, true, 1, 'Betriebsferien zwischen den Jahren'),
    (v_company_a, (date_trunc('year', now()) + interval '11 months' + interval '30 days')::date, true, 1, 'Betriebsferien zwischen den Jahren');

  -- --------------------------------------------------------------------------
  -- 5. Kunden und Fahrzeuge der Beispiel-Werkstatt
  -- --------------------------------------------------------------------------
  insert into public.customers (id, company_id, first_name, last_name, email, phone, street, postal_code, city, notes)
  values
    (c1, v_company_a, 'Sabine',  'Hoffmann', 'sabine.hoffmann@example.com', '+49 711 22334-1', 'Lindenweg 12',   '70599', 'Stuttgart', 'Stammkundin, wünscht Rückruf vor jeder Reparatur.'),
    (c2, v_company_a, 'Thomas',  'Weber',    'thomas.weber@example.com',    '+49 7151 88765',  'Bahnhofstraße 5','71332', 'Waiblingen', null),
    (c3, v_company_a, 'Yasemin', 'Demir',    'yasemin.demir@example.com',   '+49 711 44556-9', 'Kelterplatz 3',  '70372', 'Stuttgart', 'Firmenfahrzeug, Rechnung an Firma.'),
    (c4, v_company_a, 'Peter',   'Lang',     'peter.lang@example.com',      '+49 7022 33445',  'Am Sportfeld 18','71083', 'Herrenberg', null),
    (c5, v_company_a, 'Miriam',  'Krauss',   'miriam.krauss@example.com',   '+49 711 99887-4', 'Rosenbergstraße 61', '70176', 'Stuttgart', 'Neukundin — Fahrzeug noch nicht im Bestand.');

  insert into public.vehicles (id, company_id, customer_id, make, model, year, license_plate, vin, mileage_km, fuel_type, notes)
  values
    (v1, v_company_a, c1, 'Volkswagen', 'Golf 7',       2018, 'S-GO 1234',  'WVWZZZ1KZJW123456', 118400, 'diesel',  'Letzter Service vor 14 Monaten.'),
    (v2, v_company_a, c2, 'BMW',        '320d Touring', 2016, 'WN-BM 320',  'WBA8E11020K654321', 186500, 'diesel',  'Geräusche an der Vorderachse.'),
    (v3, v_company_a, c3, 'Opel',       'Corsa-e',      2022, 'S-OP 2201',  'W0V7H6EA1N4012345',  32450, 'elektro', 'Firmenfahrzeug, Ladekabel an Bord.'),
    (v4, v_company_a, c4, 'Ford',       'Focus Turnier',2014, 'HZ-FO 914',  'WF0AXXGCDAEY98765', 213900, 'benzin',  null);

  -- --------------------------------------------------------------------------
  -- 6. Kunden und Fahrzeuge des zweiten Mandanten (nur für den Trennungsnachweis)
  -- --------------------------------------------------------------------------
  insert into public.customers (id, company_id, first_name, last_name, email, phone, city)
  values
    (cb1, v_company_b, 'Jonas',  'Petersen', 'jonas.petersen@example.com', '+49 40 112233', 'Hamburg'),
    (cb2, v_company_b, 'Katrin', 'Albers',   'katrin.albers@example.com',  '+49 40 445566', 'Norderstedt');

  insert into public.vehicles (id, company_id, customer_id, make, model, year, license_plate, mileage_km, fuel_type)
  values
    (vb1, v_company_b, cb1, 'Cube', 'Stereo Hybrid 140', 2023, null, 4200, 'sonstiges');

  -- --------------------------------------------------------------------------
  -- 7. Anfragen in verschiedenen Status
  -- --------------------------------------------------------------------------
  insert into public.requests (
    id, company_id, customer_id, vehicle_id, status, service_type, description,
    preferred_date_from, preferred_date_to, preferred_time_note,
    estimated_price_min, estimated_price_max, price_estimate_note,
    contact_preference, source, staff_note, rejection_reason, decided_at, decided_by,
    created_at, updated_at
  )
  values
    -- 1) neu — unbearbeitet, liegt in der Inbox
    (
      r1, v_company_a, c1, v1, 'neu', 'Inspektion',
      'Fällige Inspektion laut Serviceheft. Bitte auch Bremsflüssigkeit prüfen.',
      (now() + interval '5 days')::date, (now() + interval '12 days')::date, 'Am liebsten morgens ab 8 Uhr.',
      289.00, 420.00, 'Erfahrungswert Inspektion Golf 7 inkl. Material.',
      'email', 'online', null, null, null, null,
      now() - interval '4 hours', now() - interval '4 hours'
    ),
    -- 2) neu — zweite offene Anfrage
    (
      r2, v_company_a, c2, v2, 'neu', 'Unfallschaden / Achsvermessung',
      'Poltern an der Vorderachse nach Bordsteinkontakt, Lenkrad steht leicht schief.',
      (now() + interval '2 days')::date, (now() + interval '4 days')::date, 'Termin möglichst zeitnah.',
      120.00, 340.00, 'Achsvermessung ca. 120 €, Reparatur je Befund.',
      'telefon', 'online', 'Kunde ist mobil erreichbar, Rückruf erwünscht.', null, null, null,
      now() - interval '1 day', now() - interval '1 day'
    ),
    -- 3) bestätigt — Termin steht
    (
      r3, v_company_a, c3, v3, 'bestaetigt', 'Reifenwechsel',
      'Wechsel auf Winterreifen inkl. Einlagerung der Sommerreifen.',
      (now() + interval '3 days')::date, (now() + interval '3 days')::date, 'Fahrzeug wird morgens gebracht.',
      79.00, 129.00, 'Wechsel inkl. Einlagerung pro Satz.',
      'email', 'online', 'Reifensatz liegt im Lager, Fahrzeug erscheint um 8:00 Uhr.',
      null, now() - interval '6 hours', v_user_a,
      now() - interval '2 days', now() - interval '6 hours'
    ),
    -- 4) abgelehnt — mit Begründung
    (
      r4, v_company_a, c4, v4, 'abgelehnt', 'Karosseriearbeiten',
      'Tür hinten links eingedellt, soll komplett lackiert werden.',
      (now() + interval '7 days')::date, (now() + interval '9 days')::date, null,
      600.00, 900.00, 'Grobe Schätzung Lackierung Tür.',
      'telefon', 'online', null,
      'Karosserie- und Lackierarbeiten führen wir nicht selbst aus. Wir haben den Kunden an die Lackiererei Wahl verwiesen.',
      now() - interval '3 days', v_user_a,
      now() - interval '6 days', now() - interval '3 days'
    ),
    -- 5) abgeschlossen — historische Anfrage
    (
      r5, v_company_a, c1, v1, 'abgeschlossen', 'Ölwechsel',
      'Ölwechsel inkl. Ölfilter.',
      (now() - interval '11 days')::date, (now() - interval '11 days')::date, null,
      89.00, 139.00, 'Ölwechsel inkl. Material.',
      'email', 'online', 'Erledigt am selben Tag.',
      null, now() - interval '10 days', v_user_a,
      now() - interval '14 days', now() - interval '10 days'
    );

  -- Zweiter Mandant: eigene Anfrage, die Mandant 1 auf keinen Fall sehen darf.
  insert into public.requests (
    id, company_id, customer_id, vehicle_id, status, service_type, description,
    preferred_date_from, preferred_date_to, estimated_price_min, estimated_price_max,
    price_estimate_note, contact_preference, source, created_at, updated_at
  )
  values (
    rb1, v_company_b, cb1, vb1, 'neu', 'E-Bike Inspektion',
    'Jahresinspektion für zwei E-Bikes inkl. Bremsenprüfung.',
    (now() + interval '4 days')::date, (now() + interval '10 days')::date,
    120.00, 180.00, 'Inspektion pro Rad ca. 60–90 €.',
    'email', 'online', now() - interval '3 hours', now() - interval '3 hours'
  );

  -- --------------------------------------------------------------------------
  -- 8. Termine
  -- --------------------------------------------------------------------------
  insert into public.appointments (
    company_id, request_id, customer_id, vehicle_id, title,
    starts_at, ends_at, status, bay, internal_note, created_by
  )
  values
    (v_company_a, r3, c3, v3, 'Reifenwechsel Opel Corsa-e',
     date_trunc('day', now()) + interval '3 days' + interval '8 hours',
     date_trunc('day', now()) + interval '3 days' + interval '9 hours',
     'bestaetigt', 'Bühne 1', 'Winterreifen stehen bereit.', v_user_a),
    (v_company_a, null, c5, null, 'Annahme Erstberatung (Neukundin)',
     date_trunc('day', now()) + interval '1 day' + interval '14 hours',
     date_trunc('day', now()) + interval '1 day' + interval '14 hours 30 minutes',
     'geplant', 'Annahme', 'Fahrzeugdaten werden vor Ort aufgenommen.', v_user_a),
    (v_company_a, r5, c1, v1, 'Ölwechsel Golf 7',
     date_trunc('day', now()) - interval '11 days' + interval '9 hours',
     date_trunc('day', now()) - interval '11 days' + interval '10 hours',
     'abgeschlossen', 'Bühne 2', null, v_user_a),
    (v_company_b, rb1, cb1, vb1, 'E-Bike Inspektion',
     date_trunc('day', now()) + interval '5 days' + interval '10 hours',
     date_trunc('day', now()) + interval '5 days' + interval '12 hours',
     'geplant', 'Werkbank 2', null, v_user_b);

  -- --------------------------------------------------------------------------
  -- 9. Datei-Metadaten (Beispiel — die Binärdaten liegen in Supabase Storage)
  -- --------------------------------------------------------------------------
  insert into public.files (
    company_id, request_id, vehicle_id, customer_id, uploaded_by,
    bucket_id, storage_path, file_name, mime_type, size_bytes, kind, is_customer_visible
  )
  values
    (
      v_company_a, r2, v2, c2, v_user_a,
      'anfragen-dateien',
      v_company_a::text || '/anfrage/' || r2::text || '/schaden-vorderachse.jpg',
      'schaden-vorderachse.jpg', 'image/jpeg', 1843200, 'foto', true
    ),
    (
      v_company_a, r1, v1, c1, v_user_a,
      'anfragen-dateien',
      v_company_a::text || '/fahrzeug/' || v1::text || '/serviceheft-2026.pdf',
      'serviceheft-2026.pdf', 'application/pdf', 524288, 'dokument', false
    );

  raise notice 'WerkstattFlow Demo-Daten angelegt: % (Mandant 1) und % (Mandant 2).', v_company_a, v_company_b;
end;
$seed$;
