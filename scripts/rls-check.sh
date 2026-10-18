#!/usr/bin/env bash
# ============================================================================
# WerkstattFlow — RLS-Prüflauf (Mandanten-Trennung)
# ============================================================================
# Startet eine wegwerfbare PostgreSQL-Instanz, spielt den Supabase-Shim
# (supabase/tests/000_local_supabase_shim.sql), alle Migrationen und den Seed
# ein und prüft danach als angemeldeter Werkstatt-Benutzer bzw. als "anon",
# ob die Row-Level-Security wirklich dicht ist.
#
# Aufruf:   bash scripts/rls-check.sh
# Exit 0 = alle Prüfungen bestanden, Exit 1 = mindestens eine Prüfung fehlgeschlagen.
#
# Braucht ein lokales PostgreSQL (Server-Binaries: initdb, pg_ctl, psql).
# ============================================================================
set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${WF_RLS_RUN_DIR:-/tmp/wf-rls-check}"
SOCK_DIR="$RUN_DIR/sock"
DATA_DIR="$RUN_DIR/data"
PGPORT="${WF_RLS_PORT:-55432}"
DBNAME="werkstattflow_rls_test"
TEST_ROLE="rls_tester"

# Demo-IDs aus supabase/seed.sql
USER_A="11111111-1111-4111-8111-111111111111"
USER_B="22222222-2222-4222-8222-222222222222"
REQ_A="eeeeeeee-0000-4000-8000-000000000001"
REQ_B="ffffffff-0000-4000-8000-000000000001"
CUST_B="bbbbbbbb-0000-4000-8000-000000000001"

# ---------------------------------------------------------------------------
# PostgreSQL-Binaries finden
# ---------------------------------------------------------------------------
PGBIN=""
for candidate in \
  "$(command -v initdb >/dev/null 2>&1 && dirname "$(command -v initdb)")" \
  /usr/lib/postgresql/*/bin \
  /usr/local/pgsql/bin
do
  if [ -n "$candidate" ] && [ -x "$candidate/initdb" ]; then
    PGBIN="$candidate"
    break
  fi
done
if [ -z "$PGBIN" ]; then
  echo "FEHLER: PostgreSQL-Server-Binaries (initdb/pg_ctl) nicht gefunden." >&2
  echo "        Installation z. B.: sudo apt-get install -y postgresql" >&2
  exit 2
fi

AS_PG=""
if [ "$(id -u)" = "0" ]; then
  # initdb und der Server dürfen nicht als root laufen.
  AS_PG="sudo -u postgres"
fi

run() { $AS_PG "$@"; }

cleanup() {
  if [ -f "$DATA_DIR/postmaster.pid" ]; then
    run "$PGBIN/pg_ctl" -D "$DATA_DIR" -m immediate stop >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "== 1/7 Wegwerf-Datenbank aufsetzen =================================="
cleanup
rm -rf "$RUN_DIR"
mkdir -p "$SOCK_DIR" "$DATA_DIR"
if [ "$(id -u)" = "0" ]; then chown -R postgres:postgres "$RUN_DIR"; fi

run "$PGBIN/initdb" -D "$DATA_DIR" -A trust -U postgres >/dev/null 2>&1 || {
  echo "FEHLER: initdb fehlgeschlagen." >&2; exit 2; }
run "$PGBIN/pg_ctl" -D "$DATA_DIR" \
  -o "-k $SOCK_DIR -p $PGPORT -c listen_addresses='' -c fsync=off" \
  -l "$RUN_DIR/server.log" -w start >/dev/null 2>&1 || {
  echo "FEHLER: PostgreSQL startet nicht. Log: $RUN_DIR/server.log" >&2
  tail -20 "$RUN_DIR/server.log" >&2; exit 2; }

PSQL="$PGBIN/psql"
SUPER="run $PSQL -h $SOCK_DIR -p $PGPORT -U postgres -d $DBNAME -v ON_ERROR_STOP=1 -q"
run "$PGBIN/createdb" -h "$SOCK_DIR" -p "$PGPORT" -U postgres "$DBNAME"

echo "== 2/7 Supabase-Shim + Migrationen + Seed einspielen ================="
$SUPER -f "$PROJECT_DIR/supabase/tests/000_local_supabase_shim.sql" >/dev/null || {
  echo "FEHLER: Shim fehlgeschlagen." >&2; exit 2; }
for migration in "$PROJECT_DIR"/supabase/migrations/*.sql; do
  echo "   Migration: $(basename "$migration")"
  $SUPER -f "$migration" >/dev/null || {
    echo "FEHLER in $migration" >&2; exit 2; }
done
echo "   Seed:      supabase/seed.sql"
$SUPER -f "$PROJECT_DIR/supabase/seed.sql" >/dev/null || {
  echo "FEHLER im Seed." >&2; exit 2; }

# Zwei Datei-Objekte im Storage anlegen (je eines pro Mandant).
$SUPER <<SQL >/dev/null
insert into storage.objects (bucket_id, name, owner) values
  ('anfragen-dateien', (select id from public.companies where slug='kfz-werkstatt-berger')::text || '/anfrage/datei-a.jpg', '$USER_A'),
  ('anfragen-dateien', (select id from public.companies where slug='zweirad-technik-nord')::text || '/anfrage/datei-b.jpg', '$USER_B');
SQL

# Testrolle: angemeldeter Benutzer simulieren (kein Superuser, kein BYPASSRLS).
$SUPER <<SQL >/dev/null
do \$\$
begin
  if not exists (select 1 from pg_roles where rolname = '$TEST_ROLE') then
    create role $TEST_ROLE login password 'test' nosuperuser nobypassrls;
  end if;
end
\$\$;
grant authenticated to $TEST_ROLE;
grant anon to $TEST_ROLE;
SQL

TOKEN_A="$($SUPER -t -A -c "select public_token from public.requests where id = '$REQ_A'")"
TOKEN_B="$($SUPER -t -A -c "select public_token from public.requests where id = '$REQ_B'")"
PW_OK="$($SUPER -t -A -c "select count(*) from auth.users where email = 'demo@kfz-berger.de' and encrypted_password = crypt('Werkstatt2026!', encrypted_password)")"
COMPANY_A="$($SUPER -t -A -c "select id from public.companies where slug = 'kfz-werkstatt-berger'")"
COMPANY_B="$($SUPER -t -A -c "select id from public.companies where slug = 'zweirad-technik-nord'")"

echo "   Mandant 1 (Kfz-Werkstatt Berger): $COMPANY_A"
echo "   Mandant 2 (Zweirad Technik Nord): $COMPANY_B"

# ---------------------------------------------------------------------------
# Prüf-Helfer
# ---------------------------------------------------------------------------
PASSED=0
FAILED=0

# als <user-uuid> <sql>   -> Ergebnis (eine Zeile, ohne Kopf) oder Fehlertext
as_user() {
  local sub="$1"; shift
  run $PSQL -h "$SOCK_DIR" -p "$PGPORT" -U "$TEST_ROLE" -d "$DBNAME" \
    -t -A -q -v ON_ERROR_STOP=1 -c \
    "do \$\$ begin perform set_config('request.jwt.claims', '{\"sub\":\"$sub\",\"role\":\"authenticated\"}', false); end \$\$; set role authenticated; $1" 2>&1
}

# als "anon" <sql>
as_anon() {
  run $PSQL -h "$SOCK_DIR" -p "$PGPORT" -U "$TEST_ROLE" -d "$DBNAME" \
    -t -A -q -v ON_ERROR_STOP=1 -c "set role anon; $1" 2>&1
}

pruefe() { # <nr> <beschreibung> <erwartet> <tatsaechlich>
  local nr="$1" beschreibung="$2" erwartet="$3" tatsaechlich="$4"
  if [ "$erwartet" = "$tatsaechlich" ]; then
    PASSED=$((PASSED + 1))
    printf '   OK   %-3s %s\n' "$nr" "$beschreibung"
  else
    FAILED=$((FAILED + 1))
    printf '   FEHL %-3s %s\n        erwartet: %s\n        erhalten: %s\n' \
      "$nr" "$beschreibung" "$erwartet" "$tatsaechlich"
  fi
}

pruefe_fehler() { # <nr> <beschreibung> <ergebnis-oder-fehlertext>
  local nr="$1" beschreibung="$2" ausgabe="$3"
  if printf '%s' "$ausgabe" | grep -qi "row-level security"; then
    PASSED=$((PASSED + 1))
    printf '   OK   %-3s %s (von RLS abgewiesen)\n' "$nr" "$beschreibung"
  else
    FAILED=$((FAILED + 1))
    printf '   FEHL %-3s %s\n        erwartet: RLS-Fehler, erhalten: %s\n' \
      "$nr" "$beschreibung" "$ausgabe"
  fi
}

echo "== 3/7 Prüfungen als Werkstatt 1 (Kfz-Werkstatt Berger) ============="
pruefe 1  "W1 sieht nur eigene Kunden"            "5" "$(as_user "$USER_A" "select count(*) from public.customers;")"
pruefe 2  "W1 sieht nur eigene Fahrzeuge"         "4" "$(as_user "$USER_A" "select count(*) from public.vehicles;")"
pruefe 3  "W1 sieht nur eigene Anfragen"          "5" "$(as_user "$USER_A" "select count(*) from public.requests;")"
pruefe 4  "W1 sieht nur eigene Termine"           "3" "$(as_user "$USER_A" "select count(*) from public.appointments;")"
pruefe 5  "W1 sieht nur eigene Verfügbarkeiten"   "9" "$(as_user "$USER_A" "select count(*) from public.availabilities;")"
pruefe 6  "W1 sieht nur eigene Datei-Metadaten"   "2" "$(as_user "$USER_A" "select count(*) from public.files;")"
pruefe 7  "W1 sieht nur eigene Benutzerprofile"   "2" "$(as_user "$USER_A" "select count(*) from public.profiles;")"
pruefe 8  "W1 sieht genau sein Unternehmen"       "1" "$(as_user "$USER_A" "select count(*) from public.companies;")"
pruefe 9  "W1 sieht den Namen des richtigen Mandanten" "kfz-werkstatt-berger" "$(as_user "$USER_A" "select slug from public.companies;")"
pruefe 10 "Kunden von Mandant 2 sind unsichtbar"  "0" "$(as_user "$USER_A" "select count(*) from public.customers where company_id = '$COMPANY_B';")"
pruefe 11 "Anfrage von Mandant 2 per ID unsichtbar" "0" "$(as_user "$USER_A" "select count(*) from public.requests where id = '$REQ_B';")"
pruefe 12 "Fremder public_token führt zu keinem Treffer (Tabellenzugriff)" "0" "$(as_user "$USER_A" "select count(*) from public.requests where public_token = '$TOKEN_B';")"
pruefe 13 "Verfügbarkeiten von Mandant 2 unsichtbar" "0" "$(as_user "$USER_A" "select count(*) from public.availabilities where company_id = '$COMPANY_B';")"
pruefe 14 "Termine von Mandant 2 unsichtbar"      "0" "$(as_user "$USER_A" "select count(*) from public.appointments where company_id = '$COMPANY_B';")"
pruefe 15 "Datei-Metadaten von Mandant 2 unsichtbar" "0" "$(as_user "$USER_A" "select count(*) from public.files where company_id = '$COMPANY_B';")"

echo "   -- Schreibzugriffe --"
pruefe 16 "UPDATE auf fremde Anfrage ändert nichts" "0" "$(as_user "$USER_A" "with u as (update public.requests set status = 'storniert' where id = '$REQ_B' returning 1) select count(*) from u;")"
pruefe 17 "DELETE auf fremden Kunden löscht nichts" "0" "$(as_user "$USER_A" "with d as (delete from public.customers where id = '$CUST_B' returning 1) select count(*) from d;")"
pruefe 18 "UPDATE auf eigene Anfrage funktioniert (Gegenprobe)" "1" "$(as_user "$USER_A" "with u as (update public.requests set staff_note = 'Rückruf erledigt' where id = '$REQ_A' returning 1) select count(*) from u;")"
pruefe 19 "INSERT eigener Kunde funktioniert (Gegenprobe)" "6" "$(as_user "$USER_A" "begin; insert into public.customers (company_id, first_name, last_name) values ('$COMPANY_A', 'Probe', 'Kundin'); select count(*) from public.customers; rollback;")"
pruefe_fehler 20 "INSERT Kunde für fremden Mandanten wird abgewiesen" "$(as_user "$USER_A" "insert into public.customers (company_id, first_name, last_name) values ('$COMPANY_B', 'Fremd', 'Kunde');")"
pruefe_fehler 21 "INSERT Anfrage für fremden Mandanten wird abgewiesen" "$(as_user "$USER_A" "insert into public.requests (company_id, customer_id, service_type) values ('$COMPANY_B', '$CUST_B', 'Inspektion');")"
pruefe_fehler 22 "Eigene Anfrage auf fremden Mandanten umbiegen wird abgewiesen" "$(as_user "$USER_A" "update public.requests set company_id = '$COMPANY_B' where id = '$REQ_A';")"
pruefe_fehler 23 "Fremdes Benutzerprofil anlegen wird abgewiesen" "$(as_user "$USER_A" "insert into public.profiles (id, company_id, full_name) values (gen_random_uuid(), '$COMPANY_B', 'Eindringling');")"
pruefe_fehler 24 "Eigenes Unternehmen auf fremde ID ändern wird abgewiesen" "$(as_user "$USER_A" "update public.companies set id = '$COMPANY_B' where id = '$COMPANY_A';")"
pruefe 25 "auth.users ist für angemeldete Benutzer nicht lesbar" "1" "$(as_user "$USER_A" "select count(*) from auth.users;" 2>&1 | grep -ci 'permission denied')"
pruefe 26 "Storage: W1 sieht nur die eigene Datei" "1" "$(as_user "$USER_A" "select count(*) from storage.objects;")"
pruefe 27 "Storage: W1 sieht keine Datei von Mandant 2" "0" "$(as_user "$USER_A" "select count(*) from storage.objects where name like '$COMPANY_B/%';")"

echo "== 4/7 Prüfungen als Werkstatt 2 (Zweirad Technik Nord) ============="
pruefe 28 "W2 sieht nur eigene Kunden"            "2" "$(as_user "$USER_B" "select count(*) from public.customers;")"
pruefe 29 "W2 sieht nur eigene Fahrzeuge"         "1" "$(as_user "$USER_B" "select count(*) from public.vehicles;")"
pruefe 30 "W2 sieht nur eigene Anfragen"          "1" "$(as_user "$USER_B" "select count(*) from public.requests;")"
pruefe 31 "W2 sieht nur eigene Termine"           "1" "$(as_user "$USER_B" "select count(*) from public.appointments;")"
pruefe 32 "W2 sieht nur eigenes Unternehmen"      "1" "$(as_user "$USER_B" "select count(*) from public.companies;")"
pruefe 33 "W2 sieht den Namen des richtigen Mandanten" "zweirad-technik-nord" "$(as_user "$USER_B" "select slug from public.companies;")"
pruefe 34 "Anfragen von Mandant 1 sind unsichtbar" "0" "$(as_user "$USER_B" "select count(*) from public.requests where id = '$REQ_A';")"
pruefe 35 "W2 sieht keine Verfügbarkeiten von Mandant 1" "7" "$(as_user "$USER_B" "select count(*) from public.availabilities;")"
pruefe 36 "UPDATE auf Anfrage von Mandant 1 ändert nichts" "0" "$(as_user "$USER_B" "with u as (update public.requests set status = 'storniert' where id = '$REQ_A' returning 1) select count(*) from u;")"
pruefe 37 "Storage: W2 sieht nur die eigene Datei" "1" "$(as_user "$USER_B" "select count(*) from storage.objects;")"

echo "== 5/7 Prüfungen als nicht angemeldeter Besucher (anon) ============="
pruefe 38 "anon hat kein SELECT-Recht auf customers" "false" "$(as_anon "select has_table_privilege('anon', 'public.customers', 'select')::text;")"
pruefe 39 "anon hat kein SELECT-Recht auf requests"  "false" "$(as_anon "select has_table_privilege('anon', 'public.requests', 'select')::text;")"
pruefe 40 "anon hat kein INSERT-Recht auf requests"  "false" "$(as_anon "select has_table_privilege('anon', 'public.requests', 'insert')::text;")"
pruefe 41 "anon kann customers nicht abfragen" "1" "$(as_anon "select count(*) from public.customers;" 2>&1 | grep -ci 'permission denied')"
pruefe 42 "Statusabfrage per Token liefert genau 1 Anfrage" "1" "$(as_anon "select count(*) from public.get_public_request('$TOKEN_B');")"
pruefe 43 "Statusabfrage per Token liefert den richtigen Status" "neu" "$(as_anon "select status from public.get_public_request('$TOKEN_B');")"
pruefe 44 "Statusabfrage mit unbekanntem Token liefert nichts" "0" "$(as_anon "select count(*) from public.get_public_request('00000000-0000-4000-8000-000000000099');")"
pruefe 45 "Statusabfrage gibt keine Kunden- oder Werkstattdaten preis" "0" "$(as_anon "select count(*) from pg_proc p where p.proname = 'get_public_request' and pg_get_function_result(p.oid) ~ '(public_token|customer|license_plate|vin|first_name|last_name)';")"
pruefe 46 "Demo-Login-Passwort der Beispiel-Werkstatt ist gültig" "1" "$PW_OK"
pruefe 47 "Zweiter Demo-Mandant hat ein eigenes Unternehmen (Trigger greift)" "2" "$($SUPER -t -A -c "select count(*) from public.companies")"

echo "== 6/7 Öffentliches Kundenportal (nicht angemeldeter Besucher) ========"
# Erwartungswerte direkt aus den Basistabellen ableiten — damit prüfen wir die
# Funktionen gegen die echten Daten und nicht gegen hartcodierte Zahlen.
SLUG_A="kfz-werkstatt-berger"
SLUG_B="zweirad-technik-nord"
NAME_A="$($SUPER -t -A -c "select name from public.companies where slug = '$SLUG_A'")"
NAME_B="$($SUPER -t -A -c "select name from public.companies where slug = '$SLUG_B'")"
AVAIL_A="$($SUPER -t -A -c "select count(*) from public.availabilities a join public.companies c on c.id = a.company_id where c.slug = '$SLUG_A'")"
AVAIL_B="$($SUPER -t -A -c "select count(*) from public.availabilities a join public.companies c on c.id = a.company_id where c.slug = '$SLUG_B'")"
BUSY_A="$($SUPER -t -A -c "select count(*) from public.appointments a join public.companies c on c.id = a.company_id where c.slug = '$SLUG_A' and a.status in ('geplant','bestaetigt','abgeschlossen') and (a.starts_at at time zone c.timezone)::date between current_date and current_date + 60")"
BUSY_B="$($SUPER -t -A -c "select count(*) from public.appointments a join public.companies c on c.id = a.company_id where c.slug = '$SLUG_B' and a.status in ('geplant','bestaetigt','abgeschlossen') and (a.starts_at at time zone c.timezone)::date between current_date and current_date + 60")"

echo "   -- Werkstatt per Slug (Öffnungszeiten/Leistungen) --"
pruefe 48 "anon liest über den Slug genau eine Werkstatt" "1" "$(as_anon "select count(*) from public.get_public_workshop('$SLUG_A');")"
pruefe 49 "dabei kommt die richtige Werkstatt heraus (Name)" "$NAME_A" "$(as_anon "select name from public.get_public_workshop('$SLUG_A');")"
pruefe 50 "der zweite Mandant ist über seinen eigenen Slug erreichbar" "$NAME_B" "$(as_anon "select name from public.get_public_workshop('$SLUG_B');")"
pruefe 51 "über einen Slug kommt nie eine andere Werkstatt" "0" "$(as_anon "select count(*) from public.get_public_workshop('$SLUG_A') where slug <> '$SLUG_A';")"
pruefe 52 "unbekannter Slug liefert keine Werkstatt" "0" "$(as_anon "select count(*) from public.get_public_workshop('gibt-es-nicht-xyz');")"
pruefe 53 "leerer Slug liefert keine Werkstatt" "0" "$(as_anon "select count(*) from public.get_public_workshop('');")"
pruefe 54 "Öffnungszeiten/Leistungen der Werkstatt kommen vollständig an" "$AVAIL_A" "$(as_anon "select count(*) from public.get_public_availabilities('$SLUG_A');")"
pruefe 55 "die Öffnungszeiten des zweiten Mandanten sind getrennt" "$AVAIL_B" "$(as_anon "select count(*) from public.get_public_availabilities('$SLUG_B');")"
pruefe 56 "interne Notizen offener Wochentage bleiben verborgen" "0" "$(as_anon "select count(*) from public.get_public_availabilities('$SLUG_A') where weekday is not null and not is_closed and note is not null;")"
pruefe 57 "unbekannter Slug liefert keine Öffnungszeiten" "0" "$(as_anon "select count(*) from public.get_public_availabilities('gibt-es-nicht-xyz');")"

echo "   -- Freie/belegte Zeiten (Auslastung) --"
pruefe 58 "belegte Zeiten der Werkstatt stimmen mit den Terminen überein" "$BUSY_A" "$(as_anon "select count(*) from public.get_public_busy_times('$SLUG_A', current_date, current_date + 60);")"
pruefe 59 "belegte Zeiten des zweiten Mandanten sind getrennt" "$BUSY_B" "$(as_anon "select count(*) from public.get_public_busy_times('$SLUG_B', current_date, current_date + 60);")"
pruefe 60 "belegte Zeiten geben nur Tag und Minuten preis" "0" "$(as_anon "select count(*) from pg_proc p where p.proname = 'get_public_busy_times' and pg_get_function_result(p.oid) ~ '(customer|name|plate|vin|make|model|title|note|owner)';")"
pruefe 61 "unbekannter Slug liefert keine belegten Zeiten" "0" "$(as_anon "select count(*) from public.get_public_busy_times('gibt-es-nicht-xyz', current_date, current_date + 60);")"
pruefe 62 "ein riesiger Zeitraum wird auf höchstens 120 Tage begrenzt" "true" "$(as_anon "select (coalesce(max(day) - min(day), 0) <= 119)::text from public.get_public_busy_times('$SLUG_A', current_date - 3000, current_date + 3000);")"
pruefe 63 "ein verdrehter Zeitraum liefert nichts" "0" "$(as_anon "select count(*) from public.get_public_busy_times('$SLUG_A', current_date + 100, current_date);")"

echo "   -- kein Tabellenzugriff für nicht angemeldete Besucher --"
pruefe 64 "anon hat kein SELECT-Recht auf availabilities" "false" "$(as_anon "select has_table_privilege('anon', 'public.availabilities', 'select')::text;")"
pruefe 65 "anon hat kein SELECT-Recht auf appointments" "false" "$(as_anon "select has_table_privilege('anon', 'public.appointments', 'select')::text;")"
pruefe 66 "anon hat kein SELECT-Recht auf vehicles" "false" "$(as_anon "select has_table_privilege('anon', 'public.vehicles', 'select')::text;")"
pruefe 67 "anon hat kein SELECT-Recht auf companies" "false" "$(as_anon "select has_table_privilege('anon', 'public.companies', 'select')::text;")"
pruefe 68 "anon hat kein SELECT-Recht auf profiles" "false" "$(as_anon "select has_table_privilege('anon', 'public.profiles', 'select')::text;")"
pruefe 69 "anon hat kein SELECT-Recht auf files" "false" "$(as_anon "select has_table_privilege('anon', 'public.files', 'select')::text;")"
pruefe 70 "anon kann Verfügbarkeiten nicht direkt abfragen" "1" "$(as_anon "select count(*) from public.availabilities;" 2>&1 | grep -ci 'permission denied')"
pruefe 71 "anon kann Termine nicht direkt abfragen" "1" "$(as_anon "select count(*) from public.appointments;" 2>&1 | grep -ci 'permission denied')"

echo "   -- Statusseite: genau eine Anfrage über ihren Token --"
pruefe 72 "Token von Mandant 1 liefert genau eine Anfrage" "1" "$(as_anon "select count(*) from public.get_public_request('$TOKEN_A');")"
pruefe 73 "Token von Mandant 1 liefert dessen Werkstatt" "$SLUG_A" "$(as_anon "select workshop_slug from public.get_public_request('$TOKEN_A');")"
pruefe 74 "Token von Mandant 2 liefert dessen Werkstatt" "$SLUG_B" "$(as_anon "select workshop_slug from public.get_public_request('$TOKEN_B');")"
pruefe 75 "Statusabfrage liefert keine fremde Werkstatt mit" "0" "$(as_anon "select count(*) from public.get_public_request('$TOKEN_B') where workshop_slug <> '$SLUG_B';")"
pruefe 76 "Statusabfrage gibt keine Kunden-/Fahrzeugdaten preis" "0" "$(as_anon "select count(*) from pg_proc p where p.proname = 'get_public_request' and pg_get_function_result(p.oid) ~ '(customer_id|first_name|last_name|license_plate|vin|staff_note|internal_note|decided_by|public_token)';")"
pruefe 77 "Statusabfrage und Anfragefunktion kennen keinen company_id-Parameter" "0" "$(as_anon "select count(*) from pg_proc p where p.proname in ('get_public_request', 'create_public_request') and pg_get_function_arguments(p.oid) ~ 'company';")"

echo "   -- Anfrage abschicken (der einzige Schreibweg) --"
pruefe 78 "anon legt über den Slug eine Anfrage an (Gegenprobe)" "1" "$(as_anon "select count(*) from public.create_public_request('$SLUG_A', 'Ölwechsel', 'Probeanfrage aus dem RLS-Prüflauf', current_date + 2, null, 'Test', 'Kundin', 'test.kundin@example.com', null, 'email', 'Volkswagen', 'Golf 7', 2019, 98000, 'WU-TEST 1', 100, 200, 'Schätzung aus dem Prüflauf');")"
pruefe 79 "die Anfrage hängt am richtigen Mandanten (Status neu, Quelle online)" "1" "$($SUPER -t -A -c "select count(*) from public.requests r join public.companies c on c.id = r.company_id where c.slug = '$SLUG_A' and r.service_type = 'Ölwechsel' and r.source = 'online' and r.status = 'neu' and r.estimated_price_min = 100 and r.estimated_price_max = 200")"
pruefe 80 "Kunde und Fahrzeug werden dabei angelegt" "1" "$($SUPER -t -A -c "select count(*) from public.customers cu join public.vehicles v on v.customer_id = cu.id where cu.email = 'test.kundin@example.com' and upper(v.license_plate) = 'WU-TEST 1'")"
pruefe 81 "eine zweite Anfrage in derselben Minute wird abgewiesen" "1" "$(as_anon "select count(*) from public.create_public_request('$SLUG_A', 'Ölwechsel', null, current_date + 2, null, 'Test', 'Kundin', 'test.kundin@example.com', null, 'email', 'Volkswagen', 'Golf 7', 2019, 98000, 'WU-TEST 1', 100, 200, null);" 2>&1 | grep -ci 'zu_schnell')"
pruefe 82 "anon bekommt über current_company_id() keine Werkstatt genannt" "true" "$(as_anon "select (public.current_company_id() is null)::text;")"

echo "== 7/7 Werkstatt-Weg: Anfragen bearbeiten (Baustein 3, Teil A) ========"
# Bestätigen, Ablehnen, Abschließen und Stornieren laufen über die Funktionen
# confirm_request / reject_request / set_request_status (Migration
# 20260101000500). Sie sind SECURITY INVOKER — es gilt also die RLS des
# angemeldeten Benutzers. Genau das wird hier geprüft: Werkstatt 2 darf an den
# Daten von Werkstatt 1 nichts sehen und nichts ändern, Werkstatt 1 an ihren
# eigenen Daten alles (Gegenprobe).
CUST_A="$($SUPER -t -A -c "select customer_id from public.requests where id = '$REQ_A'")"
TERMIN_ZIEL="$($SUPER -t -A -c "select (current_date + 2)::text")"
# Die über das öffentliche Portal angelegte Anfrage (Prüfung 78) ist noch offen
# und dient unten als zweiter Fall für Kollision, Bestätigen und Abschließen.
REQ_OE="$($SUPER -t -A -c "select id from public.requests where company_id = '$COMPANY_A' and service_type = 'Ölwechsel' and status = 'neu' order by created_at desc limit 1")"

echo "   -- Werkstatt 2 greift auf die Anfrage von Werkstatt 1 zu --"
pruefe 83  "W2 sieht die Anfrage von W1 nicht" "0" "$(as_user "$USER_B" "select count(*) from public.requests where id = '$REQ_A';")"
pruefe 84  "W2 kann die Anfrage von W1 nicht bestätigen" "1" "$(as_user "$USER_B" "select count(*) from public.confirm_request('$REQ_A', '$TERMIN_ZIEL'::date, '07:30'::time, 60, 'Fremde Bühne', null);" 2>&1 | grep -ci 'anfrage_unbekannt')"
pruefe 85  "W2 kann die Anfrage von W1 nicht ablehnen" "1" "$(as_user "$USER_B" "select count(*) from public.reject_request('$REQ_A', 'Fremder Grund');" 2>&1 | grep -ci 'anfrage_unbekannt')"
pruefe 86  "W2 kann die Anfrage von W1 weder abschließen noch stornieren" "1" "$(as_user "$USER_B" "select count(*) from public.set_request_status('$REQ_A', 'storniert');" 2>&1 | grep -ci 'anfrage_unbekannt')"
pruefe 87  "der Status der Anfrage von W1 ist dabei unverändert geblieben" "neu" "$($SUPER -t -A -c "select status from public.requests where id = '$REQ_A'")"
pruefe 88  "W2 hat keinen Entscheidungszeitpunkt gesetzt (decided_at bleibt leer)" "1" "$($SUPER -t -A -c "select count(*) from public.requests where id = '$REQ_A' and decided_at is null")"
pruefe 89  "für die Anfrage von W1 ist kein Termin entstanden" "0" "$($SUPER -t -A -c "select count(*) from public.appointments where request_id = '$REQ_A'")"
pruefe 90  "W2 kann die Anfrage von W1 nicht auf sich umbiegen" "0" "$(as_user "$USER_B" "with u as (update public.requests set company_id = '$COMPANY_B' where id = '$REQ_A' returning 1) select count(*) from u;")"
pruefe 91  "W2 kann fremde Anfragen auch direkt in der Tabelle nicht ändern" "0" "$(as_user "$USER_B" "with u as (update public.requests set status = 'bestaetigt', decided_at = now() where id = '$REQ_A' returning 1) select count(*) from u;")"
pruefe 92  "W2 kann keinen Termin für Mandant 1 anlegen (RLS-Abweisung)" "1" "$(as_user "$USER_B" "with i as (insert into public.appointments (company_id, request_id, customer_id, title, starts_at, ends_at) values ('$COMPANY_A', '$REQ_A', '$CUST_A', 'Fremdtermin', now(), now() + interval '1 hour') returning 1) select count(*) from i;" 2>&1 | grep -ci 'row-level security')"
pruefe 93  "W2 kann keine Anfrage für Mandant 1 anlegen (RLS-Abweisung)" "1" "$(as_user "$USER_B" "with i as (insert into public.requests (company_id, customer_id, service_type) values ('$COMPANY_A', '$CUST_A', 'Fremdauftrag') returning 1) select count(*) from i;" 2>&1 | grep -ci 'row-level security')"
pruefe 94  "W2 kann den bestehenden Termin von Mandant 1 nicht absagen" "0" "$(as_user "$USER_B" "with u as (update public.appointments set status = 'abgesagt' where company_id = '$COMPANY_A' returning 1) select count(*) from u;")"

echo "   -- Inbox: jede Werkstatt sieht ausschließlich eigene Anfragen --"
pruefe 95  "Inbox von W1 enthält ausschließlich eigene Anfragen" "0" "$(as_user "$USER_A" "select count(*) from public.requests where company_id <> '$COMPANY_A';")"
pruefe 96  "Inbox von W2 enthält ausschließlich eigene Anfragen" "0" "$(as_user "$USER_B" "select count(*) from public.requests where company_id <> '$COMPANY_B';")"
pruefe 97  "Inbox von W1 zeigt vollständig, was Mandant 1 gehört" "$($SUPER -t -A -c "select count(*) from public.requests where company_id = '$COMPANY_A'")" "$(as_user "$USER_A" "select count(*) from public.requests;")"
pruefe 98  "die Anfrage von W1 taucht in der Inbox von W2 nicht auf" "0" "$(as_user "$USER_B" "select count(*) from public.requests where id = '$REQ_A';")"
pruefe 99  "W1 sieht die Anfrage des zweiten Mandanten nicht" "0" "$(as_user "$USER_A" "select count(*) from public.requests where company_id = '$COMPANY_B';")"

echo "   -- Gegenprobe: Werkstatt 1 bearbeitet ihre EIGENE Anfrage --"
pruefe 100 "W1 bestätigt die eigene Anfrage — der Aufruf gelingt" "1" "$(as_user "$USER_A" "select count(*) from public.confirm_request('$REQ_A', '$TERMIN_ZIEL'::date, '07:30'::time, 60, 'Bühne 1', 'Probe aus dem Prüflauf');")"
pruefe 101 "die Anfrage steht nun auf bestätigt (mit Entscheidungszeitpunkt)" "1" "$($SUPER -t -A -c "select count(*) from public.requests where id = '$REQ_A' and status = 'bestaetigt' and decided_at is not null")"
pruefe 102 "der zugehörige Termin gehört zu Mandant 1 und ist bestätigt" "1" "$($SUPER -t -A -c "select count(*) from public.appointments where request_id = '$REQ_A' and company_id = '$COMPANY_A' and status = 'bestaetigt'")"
pruefe 103 "der Termin startet um 07:30 Uhr in der Zeitzone der Werkstatt" "07:30" "$($SUPER -t -A -c "select to_char(starts_at at time zone (select timezone from public.companies where id = '$COMPANY_A'), 'HH24:MI') from public.appointments where request_id = '$REQ_A'")"
pruefe 104 "ein zweites Bestätigen derselben Anfrage wird abgewiesen" "1" "$(as_user "$USER_A" "select count(*) from public.confirm_request('$REQ_A', '$TERMIN_ZIEL'::date, '10:00'::time, 60, null, null);" 2>&1 | grep -ci 'status_ungueltig')"
pruefe 105 "daraus ist kein zweiter Termin entstanden" "1" "$($SUPER -t -A -c "select count(*) from public.appointments where request_id = '$REQ_A'")"
pruefe 106 "eine bereits bestätigte Anfrage lässt sich nicht mehr ablehnen" "1" "$(as_user "$USER_A" "select count(*) from public.reject_request('$REQ_A', 'Zu spät');" 2>&1 | grep -ci 'status_ungueltig')"
pruefe 107 "die Ablehnung wurde nicht gespeichert" "1" "$($SUPER -t -A -c "select count(*) from public.requests where id = '$REQ_A' and status = 'bestaetigt' and rejection_reason is null")"
pruefe 108 "ein Termin zur selben Zeit wird als Kollision abgewiesen" "1" "$(as_user "$USER_A" "select count(*) from public.confirm_request('$REQ_OE', '$TERMIN_ZIEL'::date, '07:45'::time, 60, null, null);" 2>&1 | grep -ci 'termin_kollision')"
pruefe 109 "durch die Kollision ist kein Termin entstanden" "0" "$($SUPER -t -A -c "select count(*) from public.appointments where request_id = '$REQ_OE'")"
pruefe 110 "ein freier Zeitpunkt derselben Anfrage wird angenommen" "1" "$(as_user "$USER_A" "select count(*) from public.confirm_request('$REQ_OE', '$TERMIN_ZIEL'::date, '10:00'::time, 30, 'Bühne 2', null);")"
pruefe 111 "die zweite Anfrage ist bestätigt und hat ihren Termin" "1" "$($SUPER -t -A -c "select count(*) from public.appointments a join public.requests r on r.id = a.request_id where a.request_id = '$REQ_OE' and r.status = 'bestaetigt' and a.status = 'bestaetigt'")"
pruefe 112 "Ablehnen ohne Begründung wird abgewiesen" "1" "$(as_user "$USER_A" "select count(*) from public.reject_request('eeeeeeee-0000-4000-8000-000000000002', '   ');" 2>&1 | grep -ci 'begruendung_fehlt')"
pruefe 113 "W1 lehnt eine eigene offene Anfrage mit Begründung ab" "1" "$(as_user "$USER_A" "select count(*) from public.reject_request('eeeeeeee-0000-4000-8000-000000000002', 'Keine Kapazität im Wunschzeitraum.');")"
pruefe 114 "die Begründung ist gespeichert (der Kunde sieht sie)" "1" "$($SUPER -t -A -c "select count(*) from public.requests where id = 'eeeeeeee-0000-4000-8000-000000000002' and status = 'abgelehnt' and rejection_reason = 'Keine Kapazität im Wunschzeitraum.'")"
pruefe 115 "eine abgelehnte Anfrage lässt sich nicht mehr abschließen" "1" "$(as_user "$USER_A" "select count(*) from public.set_request_status('eeeeeeee-0000-4000-8000-000000000002', 'abgeschlossen');" 2>&1 | grep -ci 'status_ungueltig')"
pruefe 116 "W1 schließt einen bestätigten Auftrag ab" "1" "$(as_user "$USER_A" "select count(*) from public.set_request_status('$REQ_OE', 'abgeschlossen') where appointment_status = 'abgeschlossen';")"
pruefe 117 "der zugehörige Termin steht ebenfalls auf abgeschlossen" "1" "$($SUPER -t -A -c "select count(*) from public.appointments where request_id = '$REQ_OE' and status = 'abgeschlossen'")"
pruefe 118 "W1 storniert die bestätigte Anfrage, der Termin wird abgesagt" "1" "$(as_user "$USER_A" "select count(*) from public.set_request_status('$REQ_A', 'storniert') where appointment_status = 'abgesagt';")"
pruefe 119 "der Termin ist in der Datenbank tatsächlich abgesagt" "1" "$($SUPER -t -A -c "select count(*) from public.appointments where request_id = '$REQ_A' and status = 'abgesagt'")"
pruefe 120 "der Entscheidungszeitpunkt bleibt beim Stornieren erhalten" "1" "$($SUPER -t -A -c "select count(*) from public.requests where id = '$REQ_A' and status = 'storniert' and decided_at is not null and rejection_reason is null")"
pruefe 121 "W2 sieht nach alldem weiterhin nur seine eigene Anfrage" "1" "$(as_user "$USER_B" "select count(*) from public.requests;")"
pruefe 122 "anon darf die Bearbeitungsfunktionen nicht ausführen" "false" "$(as_anon "select (has_function_privilege('anon', 'public.confirm_request(uuid,date,time,integer,text,text)', 'execute') or has_function_privilege('anon', 'public.reject_request(uuid,text)', 'execute') or has_function_privilege('anon', 'public.set_request_status(uuid,text)', 'execute'))::text;")"
pruefe 123 "die Bearbeitungsfunktionen laufen nicht als SECURITY DEFINER" "0" "$($SUPER -t -A -c "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('confirm_request','reject_request','set_request_status') and p.prosecdef")"

echo "== 8/8 Terminübersicht: Kalenderdaten (Baustein 3, Teil B1b) ========="
# Die Terminübersicht (src/lib/dashboard/kalender-daten.ts) fragt zwei Dinge ab:
# Termine der eigenen Werkstatt im Zeitraum (Überschneidung von starts_at und
# ends_at) und die noch offenen Anfragen mit Wunschzeitraum. Beides läuft mit
# der Sitzung des angemeldeten Benutzers; die Trennung macht die RLS. Hier
# werden genau diese beiden Abfragen nachgestellt — je einmal als Werkstatt 1,
# einmal als Werkstatt 2 und einmal als anon.
CAL_VON="$($SUPER -t -A -c "select (current_date - 61)::text || 'T00:00:00.000Z'")"
CAL_BIS="$($SUPER -t -A -c "select (current_date + 61)::text || 'T23:59:59.999Z'")"
echo "   -- Kalenderabfrage der Werkstatt (Zeitraum wie im Dashboard) --"
pruefe 124 "W1 sieht im Kalenderzeitraum ausschließlich eigene Termine" "0" \
  "$(as_user "$USER_A" "select count(*) from public.appointments where starts_at <= '$CAL_BIS'::timestamptz and ends_at >= '$CAL_VON'::timestamptz and company_id <> '$COMPANY_A';")"
pruefe 125 "W1 sieht im Kalenderzeitraum vollständig die Termine von Mandant 1" \
  "$($SUPER -t -A -c "select count(*) from public.appointments where company_id = '$COMPANY_A' and starts_at <= '$CAL_BIS'::timestamptz and ends_at >= '$CAL_VON'::timestamptz")" \
  "$(as_user "$USER_A" "select count(*) from public.appointments where starts_at <= '$CAL_BIS'::timestamptz and ends_at >= '$CAL_VON'::timestamptz;")"
pruefe 126 "W2 sieht den (stornierten) Termin von W1 auch im Kalender nicht" "0" \
  "$(as_user "$USER_B" "select count(*) from public.appointments where request_id = '$REQ_A';")"
pruefe 127 "W2 sieht im Kalenderzeitraum ausschließlich eigene Termine" "0" \
  "$(as_user "$USER_B" "select count(*) from public.appointments where starts_at <= '$CAL_BIS'::timestamptz and ends_at >= '$CAL_VON'::timestamptz and company_id <> '$COMPANY_B';")"
echo "   -- Offene Anfragen mit Wunschzeitraum (Tagesdetail) --"
pruefe 128 "W1 sieht keinen Wunschzeitraum von Mandant 2" "0" \
  "$(as_user "$USER_A" "select count(*) from public.requests where company_id = '$COMPANY_B' and (preferred_date_from is not null or preferred_date_to is not null);")"
pruefe 129 "W2 sieht keinen Wunschzeitraum von Mandant 1" "0" \
  "$(as_user "$USER_B" "select count(*) from public.requests where company_id = '$COMPANY_A' and (preferred_date_from is not null or preferred_date_to is not null);")"
echo "   -- anon kommt an keine Kalenderdaten --"
pruefe 130 "anon kann Termine auch mit Zeitraumfilter nicht lesen" "1" \
  "$(as_anon "select count(*) from public.appointments where starts_at <= '$CAL_BIS'::timestamptz and ends_at >= '$CAL_VON'::timestamptz;" 2>&1 | grep -ci 'permission denied')"
pruefe 131 "anon kann Anfragen mit Wunschzeitraum nicht lesen" "1" \
  "$(as_anon "select count(*) from public.requests where preferred_date_from is not null or preferred_date_to is not null;" 2>&1 | grep -ci 'permission denied')"
pruefe 132 "anon hat kein Spaltenrecht auf appointments.starts_at" "false" \
  "$(as_anon "select has_column_privilege('anon', 'public.appointments', 'starts_at', 'select')::text;")"
echo
echo "======================================================================"
echo " ERGEBNIS: $PASSED bestanden, $FAILED fehlgeschlagen"
echo "======================================================================"
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
exit 0
