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

## Kundenportal: die öffentliche Werkstattseite

Jede Werkstatt hat eine öffentliche Adresse nach dem Muster:

    /w/<slug>

Die Beispiel-Werkstatt aus den Demo-Daten ist erreichbar unter:

    /w/kfz-werkstatt-berger        (Demo-Login: demo@kfz-berger.de / Werkstatt2026!)
    /w/zweirad-technik-nord        (zweiter Mandant, nur zum Prüfen der Datentrennung)

Der Slug steht in der Tabelle `companies.slug` und wird beim Registrieren
vergeben (Kleinbuchstaben, Zahlen, Bindestriche).

**Der Weg für Kundinnen und Kunden:** Startseite der Werkstatt öffnen → Kalender
mit den freien Tagen ansehen → Tag und Uhrzeit auswählen. Das Mehrschrittformular
mit Fahrzeugdaten und Preisschätzung sowie die Statusseite `/status/<token>`
folgen als nächster Schritt (Baustein 2, Teil B).

**Wenn noch nichts zu sehen ist:** Solange Supabase nicht verbunden ist (siehe
Abschnitt „Supabase verbinden“), zeigt die Seite einen deutschen Hinweis statt
eines Fehlers. Ein unbekannter Slug führt auf eine saubere 404-Seite.

### Prüfen und testen (ohne Supabase)

    npm test          # 225 Tests der Logikschicht (Kalender, Preisschätzung,
                      # Formularprüfung, Token, Farbe, Formatierung, QR-Encoder
                      # sowie Statusübergänge, Terminprüfung, Inbox des
                      # Dashboards und Terminübersicht/Kalenderlogik)
    npx tsc --noEmit  # Typecheck
    npm run build     # Production-Build (Vercel-fähig)
    npm run rls:check # Mandanten-Trennung + öffentliche Zugriffspfade +
                      # Bearbeiten im Werkstatt-Dashboard + Kalenderdaten:
                      # baut lokal ein Postgres auf und prüft 132 Punkte

`npm run rls:check` braucht ein lokales PostgreSQL (Paket `postgresql`).

### QR-Code des Werkstattlinks prüfen
`src/lib/dashboard/qr.ts` erzeugt den QR-Code zum Werkstattlink als SVG (Download
in den Einstellungen) und als PNG. Ob die Codes wirklich scannbar sind, lässt
sich nicht mit einem Unit-Test belegen, sondern nur mit einem echten Decoder: Das
Prüfskript schreibt jeden Fall als PNG und als SVG, rastert das SVG und liest
beides mit `zbar` zurück.

    # Einmalig, nur zum Prüfen (bewusst KEINE Projektabhängigkeit):
    sudo apt-get install -y zbar-tools librsvg2-bin
    node --experimental-strip-types scripts/qr-zbar-pruefen.ts

Gemessenes Ergebnis (Stand 15.10.2026): **123 Fälle**, davon
**PNG (zbar) 123/123** und **SVG → rsvg-convert → PNG (zbar) 123/123** exakt
zurückgelesen, **0 Fehlschläge**. Die Fälle sind die Referenzfälle aus
`tests/dashboard/qr-referenz.json` (erzeugt mit dem Referenzwerkzeug `segno`,
Versionen 1–10, Stufen L/M/Q/H, alle acht Masken, Kapazitätsgrenzen) plus die im
Betrieb vorkommenden Formen: öffentlicher Werkstattlink, lange URL mit
Parametern, Umlaute.

`zbarimg` (Paket `zbar-tools`), `rsvg-convert` (Paket `librsvg2-bin`) und `segno`
(Python) sind reine **Prüfwerkzeuge**: Sie stehen weder in `package.json` noch in
`node_modules` und werden für Betrieb oder Deployment nicht gebraucht. Wer das
Skript nicht ausführt, braucht sie nicht zu installieren.

**Zwei Werkstätten zum Prüfen der Datentrennung:** Die Demo-Daten enthalten die
Kfz-Werkstatt Berger und den zweiten Mandanten „Zweirad Technik Nord“. Beide
sehen ausschließlich ihre eigenen Anfragen — der Datenbankschutz (Row Level
Security) wird mit `npm run rls:check` nachgewiesen.

## Der Werkstatt-Weg (Baustein 3, Teil A)

Nach dem Einloggen arbeitet die Werkstatt hier:

1. **Einloggen** — `/login`. Demo-Zugang der Beispieldaten:
   `demo@kfz-berger.de` / `Werkstatt2026!`. Ohne gültige Anmeldung leitet jede
   Dashboard-Seite auf `/login` um; Daten werden dabei nicht ausgeliefert.
2. **Übersicht** — `/dashboard`. Begrüßung, die wichtigsten Zahlen (offene,
   bestätigte, abgelehnte, abgeschlossene und stornierte Anfragen), die
   nächsten Termine und die zuletzt eingegangenen Anfragen.
3. **Inbox** — `/dashboard/anfragen`. Alle Anfragen der eigenen Werkstatt,
   neueste zuerst. Filter nach Status (Alle, Neu, Bestätigt, Abgelehnt,
   Abgeschlossen, Storniert) und Umschalten der Sortierung (neueste/älteste
   zuerst); beides steht in der Adresszeile und bleibt beim Neuladen erhalten.
   Jede Zeile zeigt Eingang („vor 4 Stunden“), Anliegen, Fahrzeug, Wunschtermin
   und Status.
4. **Anfrage öffnen** — `/dashboard/anfragen/<id>`. Kundendaten, Fahrzeug,
   Beschreibung, Wunschtermin, Preisschätzung und Kontaktwunsch; rechts die
   passenden Aktionen für den aktuellen Status.
5. **Bestätigen mit Terminvergabe** — Datum, Uhrzeit (HH:MM), Dauer, Bühne und
   Notiz. Die Oberfläche prüft Datum, Uhrzeit und Dauer sowie Kollisionen mit
   bereits vergebenen Terminen und meldet auf Deutsch, welcher Termin im Weg
   steht. Die Datenbank prüft dasselbe noch einmal und legt Statuswechsel und
   Termin in **einer** Transaktion an — eine „bestätigte“ Anfrage ohne Termin
   kann es nicht geben.
6. **Ablehnen mit Begründung** — die Begründung ist Pflicht; der Kunde sieht
   sie auf seiner Statusseite `/status/<token>`.
7. **Abschließen oder stornieren** — nach der Durchführung bzw. wenn der Auftrag
   zurückgezogen wird. Der zugehörige Termin wird mitgeführt (abgeschlossen
   bzw. abgesagt, der Slot wird damit wieder frei).
8. **Nicht erlaubte Schritte** — jede Aktion ist nur aus dem passenden
   Ausgangsstatus möglich (entschieden wird nur aus „Neu“). Ist die Anfrage
   inzwischen bearbeitet, erscheint ein deutscher Hinweis („Die Anfrage wurde
   inzwischen bearbeitet …“) statt einer stillen Änderung.

**Ohne Supabase-Zugangsdaten:** `/dashboard` und alle Unterseiten leiten auf
`/login` um; die Login-Seite zeigt den deutschen Hinweis, dass Supabase noch
nicht verbunden ist. Es werden keine Werkstattdaten angezeigt. Mit echten
Zugangsdaten ist die Anmeldung erst nach Schritt 3 und 4 (Zugangsdaten +
Datenbank) möglich.

Zum Nachlesen im Code: Die Logik (Statusübergänge, Kollisionsprüfung, Filter,
Sortierung, Kennzahlen, Anzeigetexte) steht in `src/lib/dashboard/anfragen.ts`
und ist mit `npm test` abgedeckt; die Datenbank-Funktionen liegen in
`supabase/migrations/20260101000500_dashboard_request_actions.sql`.

### Terminübersicht und Kundenlink-QR (Baustein 3, Teil B1b)

**Terminübersicht** — `/dashboard/kalender`. Monatsansicht mit Blättern
(„vorheriger/nächster Monat“, „Heute“); jeder Tag zeigt die Zahl der Termine
und der offenen Anfragen, deren Wunschzeitraum diesen Tag enthält. Ein Klick auf
einen Tag öffnet darunter das **Tagesdetail**: alle Termine des Tages mit
Uhrzeit, Kunde, Fahrzeug und Leistung sowie die offenen Anfragen mit
Wunschzeitraum. Ein Termin gehört zu dem Tag, an dem er **in der Zeitzone der
Werkstatt** beginnt; Termine über Mitternacht sind als solche gekennzeichnet.

**Kundenlink + QR-Download** — `/dashboard/kundenlink`. Zeigt den öffentlichen
Link der Werkstatt (`/w/<slug>`) zum Kopieren und denselben Link als QR-Code.
Der QR-Code lässt sich als **SVG** (scharf für Druck) und als **PNG**
(für Chat, E-Mail, Social Media) herunterladen; beide Dateien entstehen auf
Knopfdruck über die Route `/dashboard/kundenlink/qr/[format]`
(`svg` bzw. `png`) und tragen einen sprechenden Dateinamen
(`werkstattflow-<slug>.svg` / `.png`). Erzeugt wird der Code mit der geprüften
Bibliothek `qrcode` über die schmale Fassade `src/lib/dashboard/qr.ts`.

Wie das geprüft ist:

* `tests/dashboard/kalender.test.ts` — 33 Prüfungen der Kalenderlogik:
  Monatsraster (42 Zellen, erster Wochentag, Monats-/Jahreswechsel, Schaltjahr),
  Zuordnung von Terminen und offenen Anfragen zum richtigen Tag, Sortierung,
  Kennzahlen sowie Zeitzonen- und Sommerzeit-Grenzfälle für `Europe/Berlin`
  (Umstellung am 29.03.2026 und 25.10.2026).
* `scripts/rls-check.sh` — Prüfungen 124–132 stellen die beiden Abfragen der
  Terminübersicht nach: Werkstatt A sieht keine Termine und keine
  Wunschzeiträume von Werkstatt B, jede Werkstatt sieht ihre eigenen Daten
  vollständig, und `anon` kommt an keine Termindaten.
* `scripts/qr-zbar-pruefen.ts` — liest die erzeugten Codes mit einem echten
  Scanner zurück (siehe oben).

## Der Kundenweg (Baustein 2, Teil B) — vollständig

Der Kunde braucht kein Konto. Der ganze Weg läuft über den öffentlichen Link
der Werkstatt:

1. **Werkstattlink** `/w/<slug>` — Demo-Werkstatt `/w/kfz-werkstatt-berger`
   (zweiter Mandant: `/w/zweirad-technik-nord`). Derselbe Link ist der Inhalt
   des QR-Codes, den die Werkstatt in Baustein 3 herunterladen kann.
2. **Kalender** — freie Tage und Uhrzeiten (erst 24 Stunden im Voraus buchbar),
   belegte und geschlossene Tage sind gekennzeichnet. Tag anklicken, dann eine
   Uhrzeit wählen.
3. **Anfrageformular** (vier Schritte, mobil zuerst, deutsch): 1. Anliegen
   (Leistung + Beschreibung) · 2. Fahrzeugdaten (Kennzeichen, Marke, Modell,
   Baujahr, Kilometerstand, Kraftstoff) · 3. Kontaktdaten (Name, E-Mail,
   Telefon, gewünschte Kontaktart, Pflicht-Einwilligung) · 4. Abschluss mit
   unverbindlicher Preisschätzung. Tag und Uhrzeit bleiben über alle Schritte
   erhalten; „Zurück" ändert die Terminwahl nicht. Fehlermeldungen sind deutsch
   und stehen direkt am Feld, eingegebene Werte bleiben erhalten.
4. **Absenden** — die Server Action (`src/lib/actions/anfrage.ts`) ruft
   `public.create_public_request(...)` auf. Der Mandant wird allein über den
   Slug bestimmt. Die Preisschätzung berechnet der Server neu; Werte aus dem
   Browser werden verworfen. Spamschutz: Honeypot-Feld und Ratenbegrenzung
   (zusätzlich in der Datenbank: eine Anfrage pro Minute, höchstens fünf pro
   Stunde).
5. **Erfolg** — Weiterleitung auf `/status/<token>?neu=1` mit Referenznummer,
   Hinweis auf die Bestätigung per E-Mail und dem Link zum Abspeichern.
6. **Statusseite** `/status/<token>` — jederzeit abrufbar: Stand in
   verständlichem Deutsch (neu / bestätigt / abgelehnt / abgeschlossen /
   storniert), Referenznummer, Wunsch- bzw. bestätigter Termin, Anliegen,
   Werkstatt mit Kontaktdaten und die nächsten Schritte. Der Token ist der
   einzige Zugang: falsches Format oder unbekannter Token ergeben eine saubere
   deutsche 404-Seite, niemals Daten einer anderen Anfrage.

**Noch nicht enthalten:** E-Mail- und SMS-Versand. Die Bestätigungs-E-Mail nach
der Anfrage und der SMS-Link für den Anruf-Webhook kommen in **Baustein 4**. Die
Statusseite weist darauf hin; die Stelle im Code ist vorbereitet (Kommentar an
der Weiterleitung in `src/lib/actions/anfrage.ts`; `statusLink()`,
`RESEND_API_KEY`, `EMAIL_FROM`, `TWILIO_*` stehen schon in `.env.example`).

### Ohne Supabase-Zugangsdaten

Kalender und Formular sind dann nicht nutzbar. `/w/<slug>` und `/status/<token>`
zeigen den deutschen Hinweis „Supabase ist noch nicht verbunden"; das Absenden
meldet „Das Kundenportal ist noch nicht mit der Datenbank verbunden" und
speichert nichts.
