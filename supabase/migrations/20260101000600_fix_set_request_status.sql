-- ============================================================================
-- WerkstattFlow — Migration 7: Fehler in set_request_status beheben
-- ============================================================================
-- Befund aus dem RLS-Prüflauf (scripts/rls-check.sh, Prüfungen 116-120):
--
--   ERROR: column reference "status" is ambiguous
--   LINE 4: and status <> v_termin
--
-- `set_request_status` gibt eine Tabelle mit einer Spalte `status` zurück
-- (RETURNS TABLE (status, appointment_status)). Im Rumpf ist `status` damit
-- gleichzeitig Ausgabeparameter UND Spalte von public.requests/appointments —
-- PostgreSQL kann die Referenz im WHERE des Termin-UPDATE nicht mehr auflösen.
-- Folge: Abschließen warf einen Datenbankfehler, der Termin wurde nicht
-- mitgeführt. Behoben, indem der Termin mit Alias und qualifizierten
-- Spaltennamen angesprochen wird.
--
-- Die Signatur (uuid, text) und die Spaltennamen der Rückgabe bleiben
-- unverändert — die Rechte aus Migration 6 gelten weiter.
-- ============================================================================

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
  update public.requests r
     set status = v_ziel
   where r.id = v_request.id;
  v_termin := case when v_ziel = 'abgeschlossen' then 'abgeschlossen' else 'abgesagt' end;
  -- Qualifizierte Spalten (a.status statt status): sonst kollidiert die Spalte
  -- mit dem Ausgabeparameter `status` dieser Funktion.
  update public.appointments a
     set status = v_termin
   where a.request_id = v_request.id
     and a.status <> v_termin;
  return query select v_ziel, v_termin;
end;
$$;

comment on function public.set_request_status(uuid, text) is
  'Setzt eine bestehende Anfrage auf abgeschlossen oder storniert (nur aus fachlich sinnvollen Zuständen) und führt den zugehörigen Termin mit. SECURITY INVOKER — die RLS des angemeldeten Benutzers gilt unverändert.';
