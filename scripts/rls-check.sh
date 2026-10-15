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

echo "== 1/5 Wegwerf-Datenbank aufsetzen =================================="
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

echo "== 2/5 Supabase-Shim + Migrationen + Seed einspielen ================="
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

echo "== 3/5 Prüfungen als Werkstatt 1 (Kfz-Werkstatt Berger) ============="
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

echo "== 4/5 Prüfungen als Werkstatt 2 (Zweirad Technik Nord) ============="
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

echo "== 5/5 Prüfungen als nicht angemeldeter Besucher (anon) ============="
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

echo
echo "======================================================================"
echo " ERGEBNIS: $PASSED bestanden, $FAILED fehlgeschlagen"
echo "======================================================================"
if [ "$FAILED" -gt 0 ]; then
  exit 1
fi
exit 0
