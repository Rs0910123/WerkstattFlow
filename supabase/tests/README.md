# Tests — Mandanten-Trennung (Row Level Security)

Zwei Wege, dieselbe Sache zu prüfen: dass eine Werkstatt **niemals** Daten einer
anderen Werkstatt sieht.

## 1. Automatisch (empfohlen)

```bash
bash scripts/rls-check.sh
```

Das Skript startet eine wegwerfbare PostgreSQL-Instanz in `/tmp`, spielt den
Supabase-Shim (`000_local_supabase_shim.sql`), alle Migrationen und den Seed ein
und prüft danach 47 Einzelfälle. Ausgabe: `OK`/`FEHL` je Prüfung, am Ende
`ERGEBNIS: n bestanden, m fehlgeschlagen`. Exit-Code 0 = alles in Ordnung.

Voraussetzung: ein lokales PostgreSQL (`sudo apt-get install -y postgresql`).
Es wird **nicht** der Supabase-Cloud-Zugang gebraucht.

## 2. Von Hand im Supabase-SQL-Editor

`rls_isolation_test.sql` öffnen, komplett ausführen und die Spalten `erwartet`
und `ergebnis` vergleichen. Jede Abfrage bringt ihren Erwartungswert selbst mit.
Die Datei liest nur, sie verändert nichts.

## Wozu `000_local_supabase_shim.sql`

Damit die Migrationen und Policies ohne Supabase-Cloud ausgeführt werden können,
baut der Shim die Teile von Supabase nach, auf die sie sich stützen: die Rollen
`anon` / `authenticated` / `service_role`, `auth.uid()` und die Tabellen
`auth.users`, `storage.objects` samt `storage.foldername()`.

**Diese Datei gehört nicht in ein Supabase-Projekt.** Sie ist kein Bestandteil
der Migrationen und wird nirgends deployt — sie ist ausschließlich Prüfwerkzeug.
