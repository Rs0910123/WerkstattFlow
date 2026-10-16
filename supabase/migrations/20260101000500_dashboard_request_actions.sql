-- ============================================================================
-- WerkstattFlow — Migration 6/6: Anfragen bearbeiten im Werkstatt-Dashboard
-- ============================================================================
-- Ziel (Baustein 3, Teil A): Bestätigen, Ablehnen, Abschließen und Stornieren
-- einer Anfrage — jeweils als EINE Datenbanktransaktion, damit Statuswechsel und
-- Terminanlage nie auseinanderfallen können.
--
-- Warum eigene Funktionen und nicht direktes UPDATE aus der Oberfläche?
--   1. Bestätigen besteht aus ZWEI Schreibvorgängen (requests + appointments).
--      Aus der Oberfläche wären das zwei getrennte Aufrufe — bricht der zweite
--      ab, hätte man eine "bestätigte" Anfrage ohne Termin. In einer Funktion
--      läuft beides in genau einer Transaktion: ganz oder gar nicht.
--   2. Die Kollisionsprüfung (zwei Termine zur selben Zeit) braucht ein
--      SELECT + INSERT ohne Zeitfenster dazwischen. Das geht nur innerhalb
--      einer Transaktion (siehe advisory lock unten).
--   3. Die Statusübergänge sind hier zentral und für alle Zugriffswege gleich
--      abgesichert — nicht in jeder Oberfläche neu.
--
-- Sicherheit: alle drei Funktionen sind SECURITY INVOKER (Vorgabe von Postgres),
-- es gibt also KEIN `security definer`. Sie laufen mit den Rechten und der
-- Row-Level-Security des angemeldeten Werkstatt-Benutzers. Eine fremde Anfrage
-- ist darin unsichtbar; ein Aufruf mit fremder ID endet in 'anfrage_unbekannt'
-- bzw. bleibt wirkungslos. (Nachweis: scripts/rls-check.sh, Prüfungen 83-96.)
--
-- Fehlerkennungen (deutsche Texte dazu in src/lib/dashboard/fehler.ts):
--   anfrage_unbekannt | status_ungueltig | termin_kollision |
--   termin_ungueltig | begruendung_fehlt | eingabe_ungueltig
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Bestätigen: Termin anlegen + Anfrage auf 'bestaetigt' setzen (transaktional)
-- ----------------------------------------------------------------------------
-- Datum und Uhrzeit werden bewusst getrennt übergeben. Der Zeitstempel entsteht
-- in der Zeitzone DER WERKSTATT (companies.timezone) — nicht in der Zeitzone des
-- Servers oder des Browsers. Damit stimmt der Termin auch bei Sommer-/Winterzeit.
create or replace function public.confirm_request(
  p_request_id        uuid,
  p_date              date,
  p_time              time,
  p_duration_minutes  integer default null,
  p_bay               text    default null,
  p_staff_note        text    default null
)
returns table (
  appointment_id uuid,
  starts_at      timestamptz,
  ends_at        timestamptz
)
language plpgsql
volatile
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_request     public.requests;
  v_company     public.companies;
  v_duration    integer;
  v_starts_at   timestamptz;
  v_ends_at     timestamptz;
  v_appointment uuid;
  v_title       text;
  v_fahrzeug    text;
begin
  if p_request_id is null then
    raise exception 'eingabe_ungueltig';
  end if;
  if p_date is null or p_time is null then
    raise exception 'termin_ungueltig';
  end if;

  -- 1.1 Anfrage laden. Die RLS lässt hier ausschließlich Anfragen der eigenen
  --     Werkstatt durch — deshalb genügt ein Lookup über die ID.
  select * into v_request
    from public.requests
   where id = p_request_id;

  if not found then
    raise exception 'anfrage_unbekannt';
  end if;

  if v_request.status <> 'neu' then
    raise exception 'status_ungueltig';
  end if;

  select * into v_company from public.companies where id = v_request.company_id;
  if not found then
    raise exception 'anfrage_unbekannt';
  end if;

  -- 1.2 Dauer: Vorgabe ist das Terminraster der Werkstatt (slot_minutes).
  v_duration := coalesce(p_duration_minutes, v_company.slot_minutes);
  if v_duration < 15 or v_duration > 480 then
    raise exception 'termin_ungueltig';
  end if;

  -- 1.3 Uhrzeit in der Zeitzone der Werkstatt in einen Zeitstempel übersetzen.
  v_starts_at := ((p_date + p_time) at time zone v_company.timezone);
  v_ends_at   := v_starts_at + make_interval(mins => v_duration);

  -- 1.4 Kollisionsprüfung. Ein Advisory-Lock auf die Werkstatt sorgt dafür, dass
  --     zwei gleichzeitige Bestätigungen nacheinander geprüft werden — sonst
  --     könnten beide die Prüfung bestehen und denselben Slot belegen.
  perform pg_advisory_xact_lock(hashtext(v_request.company_id::text));

  if exists (
    select 1
      from public.appointments a
     where a.company_id = v_request.company_id
       and a.status in ('geplant', 'bestaetigt', 'abgeschlossen')
       and a.starts_at < v_ends_at
       and a.ends_at > v_starts_at
  ) then
    raise exception 'termin_kollision';
  end if;

  -- 1.5 Termin anlegen (damit ist die Anfrage auch in der Kalender-Datenbasis).
  --     Titel aus Leistung + Fahrzeug, damit die Werkstatt den Termin im
  --     Kalender ohne Nachschauen erkennt.
  v_title := coalesce(nullif(btrim(v_request.service_type), ''), 'Termin');
  v_fahrzeug := (
    select nullif(btrim(coalesce(v.make, '') || ' ' || coalesce(v.model, '')), '')
      from public.vehicles v
     where v.id = v_request.vehicle_id
  );
  if v_fahrzeug is not null then
    v_title := v_title || ' (' || v_fahrzeug || ')';
  end if;
  v_title := left(v_title, 120);

  insert into public.appointments (
    company_id, request_id, customer_id, vehicle_id, title,
    starts_at, ends_at, status, bay, internal_note, created_by
  )
  values (
    v_request.company_id,
    v_request.id,
    v_request.customer_id,
    v_request.vehicle_id,
    v_title,
    v_starts_at,
    v_ends_at,
    'bestaetigt',
    nullif(left(btrim(coalesce(p_bay, '')), 80), ''),
    nullif(left(btrim(coalesce(p_staff_note, '')), 1000), ''),
    (select p.id from public.profiles p where p.id = auth.uid())
  )
  returning id into v_appointment;

  -- 1.6 Anfrage auf 'bestaetigt' setzen (CHECK-Constraint verlangt decided_at).
  update public.requests
     set status       = 'bestaetigt',
         decided_at   = now(),
         decided_by   = (select p.id from public.profiles p where p.id = auth.uid()),
         staff_note   = coalesce(nullif(left(btrim(coalesce(p_staff_note, '')), 1000), ''), staff_note)
   where id = v_request.id;

  return query select v_appointment, v_starts_at, v_ends_at;
end;
$$;

comment on function public.confirm_request(uuid, date, time, integer, text, text) is
  'Bestätigt eine Anfrage (nur aus Status neu): prüft auf Terminkollisionen und legt Anfrage-Status und Termin in einer Transaktion an. SECURITY INVOKER — die RLS des angemeldeten Benutzers gilt unverändert.';

-- ----------------------------------------------------------------------------
-- 2. Ablehnen: Begründung ist Pflicht
-- ----------------------------------------------------------------------------
create or replace function public.reject_request(
  p_request_id uuid,
  p_reason     text
)
returns table (status text, decided_at timestamptz)
language plpgsql
volatile
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_request public.requests;
  v_reason  text := nullif(left(btrim(coalesce(p_reason, '')), 2000), '');
begin
  if p_request_id is null then
    raise exception 'eingabe_ungueltig';
  end if;
  if v_reason is null then
    raise exception 'begruendung_fehlt';
  end if;

  select * into v_request from public.requests where id = p_request_id;
  if not found then
    raise exception 'anfrage_unbekannt';
  end if;

  -- Nur unbearbeitete Anfragen dürfen abgelehnt werden.
  if v_request.status <> 'neu' then
    raise exception 'status_ungueltig';
  end if;

  update public.requests
     set status           = 'abgelehnt',
         rejection_reason = v_reason,
         decided_at       = now(),
         decided_by       = (select p.id from public.profiles p where p.id = auth.uid())
   where id = v_request.id;

  return query select 'abgelehnt'::text, now();
end;
$$;

comment on function public.reject_request(uuid, text) is
  'Lehnt eine Anfrage (nur aus Status neu) mit Pflicht-Begründung ab. SECURITY INVOKER — die RLS des angemeldeten Benutzers gilt unverändert.';

-- ----------------------------------------------------------------------------
-- 3. Abschließen und Stornieren
-- ----------------------------------------------------------------------------
-- Fachlich sinnvolle Übergänge:
--   bestaetigt -> abgeschlossen   (Arbeiten erledigt)
--   bestaetigt -> storniert       (Auftrag zurückgezogen, Termin wird frei)
--   neu        -> storniert       (Kunde zieht zurück, bevor entschieden wurde)
-- Der zugehörige Termin wird mitgeführt: abgeschlossen -> 'abgeschlossen',
-- storniert -> 'abgesagt'.
create or replace function public.set_request_status(
  p_request_id uuid,
  p_status     text
)
returns table (status text, appointment_status text)
language plpgsql
volatile
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_request   public.requests;
  v_ziel      text := lower(btrim(coalesce(p_status, '')));
  v_termin    text := null;
begin
  if p_request_id is null or v_ziel not in ('abgeschlossen', 'storniert') then
    raise exception 'eingabe_ungueltig';
  end if;

  select * into v_request from public.requests where id = p_request_id;
  if not found then
    raise exception 'anfrage_unbekannt';
  end if;

  if not (
       (v_request.status = 'bestaetigt' and v_ziel in ('abgeschlossen', 'storniert'))
    or (v_request.status = 'neu'        and v_ziel = 'storniert')
  ) then
    raise exception 'status_ungueltig';
  end if;

  -- decided_at bleibt unverändert: es dokumentiert den Zeitpunkt der Entscheidung
  -- (bestätigt/abgelehnt) und wird hier nicht neu gesetzt.
  update public.requests
     set status = v_ziel
   where id = v_request.id;

  v_termin := case when v_ziel = 'abgeschlossen' then 'abgeschlossen' else 'abgesagt' end;

  update public.appointments
     set status = v_termin
   where request_id = v_request.id
     and status <> v_termin;

  return query select v_ziel, v_termin;
end;
$$;

comment on function public.set_request_status(uuid, text) is
  'Setzt eine bestehende Anfrage auf abgeschlossen oder storniert (nur aus fachlich sinnvollen Zuständen) und führt den zugehörigen Termin mit. SECURITY INVOKER — die RLS des angemeldeten Benutzers gilt unverändert.';

-- ----------------------------------------------------------------------------
-- 4. Ausführungsrechte
-- ----------------------------------------------------------------------------
-- Nur angemeldete Werkstatt-Benutzer. Nicht angemeldete Besucher ("anon")
-- bekommen keinen Zugriff — die Funktionen laufen mit ihren Rechten und hätten
-- ohne RLS-Profil ohnehin keine Wirkung.
revoke all on function public.confirm_request(uuid, date, time, integer, text, text) from public;
revoke all on function public.reject_request(uuid, text) from public;
revoke all on function public.set_request_status(uuid, text) from public;

grant execute on function public.confirm_request(uuid, date, time, integer, text, text) to authenticated;
grant execute on function public.reject_request(uuid, text) to authenticated;
grant execute on function public.set_request_status(uuid, text) to authenticated;
