# WerkstattFlow

Mandantenfähige Web-Plattform für Termin- und Auftragsanfragen.
Erster Anwendungsfall: **Kfz-Werkstatt**. Oberfläche auf Deutsch.

Kunden fragen online einen Termin an, die Werkstatt bearbeitet alle Anfragen in
ihrem eigenen Dashboard. Jede Werkstatt sieht ausschließlich ihre eigenen Daten
— abgesichert in der Datenbank selbst, nicht nur in der Oberfläche.

**Aktueller Stand: Baustein 1 „Grundgerüst“ ist fertig** — Datenbankschema,
Mandanten-Trennung, Anmeldung für Werkstätten, Dashboard mit Demo-Daten.
Das Kundenportal (Baustein 2), der volle Dashboard-Umfang (Baustein 3) und
E-Mail/SMS (Baustein 4) folgen.

---

## Was Sie brauchen

- **Node.js** ab Version 20 (empfohlen: 22) — <https://nodejs.org>
- Ein **Supabase-Konto** (kostenlos) — <https://supabase.com>
- Optional für später: Konten bei **Resend** (E-Mail) und **Twilio** (SMS)

Alle Befehle werden im Projektordner ausgeführt.

---

## Setup in 6 Schritten

### Schritt 1 — Abhängigkeiten installieren

```bash
npm install
```

### Schritt 2 — Supabase-Projekt anlegen

1. Auf <https://supabase.com> anmelden und **New project** anklicken.
2. Namen vergeben, Passwort für die Datenbank setzen, Region **Frankfurt** wählen
   (schnellste Verbindung aus Deutschland).
3. Warten, bis das Projekt fertig ist (etwa 2 Minuten).

### Schritt 3 — Zugangsdaten eintragen

1. Im Supabase-Projekt links unten auf das **Zahnrad → Project Settings →
   API Keys**.
2. Die Vorlagendatei kopieren:

   ```bash
   cp .env.example .env.local
   ```

3. In `.env.local` zwei Werte eintragen:

   | Feld in `.env.local`                 | Woher                                                |
   | ------------------------------------ | ---------------------------------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL`           | „Project URL“, z. B. `https://abcdefgh.supabase.co`  |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY`      | „anon public“ / „publishable key“                     |

   Die übrigen Felder können leer bleiben — sie werden erst für E-Mail und SMS
   in Baustein 4 gebraucht. Die Datei `.env.local` niemals weitergeben und
   niemals in Git einchecken.

> Fehlen diese zwei Werte, stürzt die App **nicht** ab: Sie zeigt auf Deutsch
> den Hinweis „Supabase ist noch nicht verbunden“ mit den fehlenden Feldnamen.

### Schritt 4 — Datenbank aufbauen und Demo-Daten einspielen

Im Supabase-Projekt links auf **SQL Editor → New query**. Führen Sie dort
nacheinander diese vier Dateien aus (jeweils Inhalt kopieren, **Run** klicken):

1. `supabase/migrations/20260101000000_initial_schema.sql`
2. `supabase/migrations/20260101000100_row_level_security.sql`
3. `supabase/migrations/20260101000200_auth_registration.sql`
4. `supabase/migrations/20260101000300_storage_policies.sql`

Danach dieselbe Prozedur mit den Demo-Daten:

5. `supabase/seed.sql`

Das legt zwei Beispiel-Werkstätten an, damit Sie sofort etwas sehen können.

**Alternative für Fortgeschrittene** (wenn die Supabase-CLI installiert ist):
`supabase db reset` spielt alle Migrationen und den Seed automatisch ein.

### Schritt 5 — Lokal starten

```bash
npm run dev
```

Dann <http://localhost:3000> öffnen.

**Zugangsdaten der Beispiel-Werkstatt:**

| Werkstatt                    | E-Mail                | Passwort        |
| ---------------------------- | --------------------- | --------------- |
| Kfz-Werkstatt Berger (Demo)  | `demo@kfz-berger.de`  | `Werkstatt2026!` |
| Zweirad Technik Nord         | `demo@zweirad-nord.de`| `Werkstatt2026!` |

Tipp: Melden Sie sich mit beiden Konten an. Sie werden sehen, dass jede
Werkstatt nur ihre eigenen Kunden, Fahrzeuge und Anfragen sieht.

### Schritt 6 — Auf Vercel veröffentlichen

1. Projekt zu GitHub hochladen (Repository anlegen, Code pushen).
2. Auf <https://vercel.com> mit GitHub anmelden und **Add New → Project**
   wählen, das Repository auswählen.
3. Unter **Environment Variables** dieselben Werte wie in `.env.local`
   eintragen (mindestens die beiden Supabase-Werte und
   `NEXT_PUBLIC_SITE_URL` = Ihre spätere Vercel-Adresse).
4. **Deploy** klicken.

In Supabase anschließend unter **Authentication → URL Configuration** die
Vercel-Adresse als „Site URL“ eintragen und
`https://ihre-adresse.vercel.app/auth/callback` zu den „Redirect URLs“ hinzufügen
— sonst funktionieren die Links aus Bestätigungs-E-Mails nicht.

---

## Prüfen, ob die Datentrennung wirklich hält

Die Mandanten-Trennung ist der wichtigste Teil der Plattform. Sie können sie
selbst nachrechnen — ohne Supabase-Zugang, auf einem lokalen PostgreSQL:

```bash
bash scripts/rls-check.sh
```

Das Skript baut eine Wegwerf-Datenbank auf, spielt Schema, Policies und
Demo-Daten ein und prüft 47 Einzelfälle (sieht Werkstatt 1 etwas von
Werkstatt 2? darf sie dort schreiben?). Am Ende steht
`ERGEBNIS: 47 bestanden, 0 fehlgeschlagen`.

Alternativ von Hand im Supabase-SQL-Editor: `supabase/tests/rls_isolation_test.sql`
öffnen und die Spalten `erwartet` und `ergebnis` vergleichen.
Details: `supabase/tests/README.md`.

---

## Projektaufbau

```
src/
  app/
    page.tsx                     Startseite (Design/Akzentfarbe sichtbar)
    layout.tsx                   Grundgerüst, Schrift Inter
    globals.css                  Tailwind + Akzentfarbe (--brand, Petrol)
    (auth)/login | registrieren | passwort-vergessen | passwort-zuruecksetzen
    auth/callback/route.ts       Rückkehr-Adresse für Links aus E-Mails
    dashboard/                   geschützter Bereich (durch Middleware geschützt)
  components/ui/                 shadcn/ui-Bausteine
  components/setup-hinweis.tsx   deutscher Hinweis, wenn Supabase fehlt
  lib/actions/auth.ts            Registrierung, Login, Logout, Passwort-Reset
  lib/data/dashboard.ts          Lesen der Werkstatt-Daten
  lib/supabase/                  Supabase-Clients (Browser, Server, Middleware)
  middleware.ts                  schützt /dashboard
  types/database.ts              Datenbanktypen (passend zu den Migrationen)
supabase/
  migrations/                    SQL-Migrationen (in dieser Reihenfolge ausführen)
  seed.sql                       Demo-Daten: zwei Beispiel-Werkstätten
  tests/                         Prüfung der Mandanten-Trennung
  config.toml                    nur für die lokale Supabase-CLI nötig
scripts/rls-check.sh             automatischer RLS-Prüflauf
```

### Akzentfarbe ändern

Die Akzentfarbe steht an genau einer Stelle: `--brand` in
`src/app/globals.css` (Standard Petrol, `188 86% 27%`). Ein Wert dort ändert
Knöpfe, Links und Hervorhebungen in der ganzen Plattform.

### Nützliche Befehle

| Befehl              | Wirkung                                        |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Entwicklungsserver auf <http://localhost:3000> |
| `npm run build`     | Production-Build (Vercel-fähig)                |
| `npm run typecheck` | TypeScript prüfen                              |
| `npm run rls:check` | Mandanten-Trennung prüfen                      |

---

## Häufige Fragen

**„Supabase ist noch nicht verbunden“ — was tun?**
`.env.local` fehlt oder ist unvollständig. Schritt 3 wiederholen und den
Entwicklungsserver neu starten.

**Anmeldung schlägt fehl mit „E-Mail-Adresse oder Passwort ist nicht korrekt“?**
Prüfen Sie, ob `supabase/seed.sql` ausgeführt wurde. Ohne Seed gibt es keine
Demo-Konten — dann einfach über „Werkstatt registrieren“ ein eigenes Konto
anlegen.

**„Ihre E-Mail-Adresse ist noch nicht bestätigt“?**
In Supabase unter **Authentication → Sign In / Providers → Email** die Option
„Confirm email“ ausschalten (für Entwicklung üblich) oder die
Bestätigungs-E-Mail anklicken.

**Keine Daten im Dashboard?**
Das Dashboard liest echte Daten aus der Datenbank. Ohne eingespielten Seed ist
es leer.
