/**
 * Tests für die kleinen Bausteine des Kundenportals:
 * Token (token.ts), Akzentfarbe (farbe.ts), Fehlertexte (fehler.ts),
 * Ratenbegrenzung (rate-limit.ts) und Formatierung (format.ts).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hexZuHslTriplett,
  hexZuWeichemTriplett,
  PETROL_TRIPLETT,
} from "../../src/lib/portal/farbe.ts";
import { FEHLER_STANDARD, uebersetzeDbFehler } from "../../src/lib/portal/fehler.ts";
import {
  datumPlusTage,
  formatiereDatum,
  formatiereDatumKurz,
  formatiereDatumLang,
  formatiereMinute,
  formatiereMonat,
  formatiereNaiveZeit,
  formatiereSlot,
  formatiereZeitstempel,
  istIsoDatum,
  jetztInZeitzone,
  minutenZwischen,
  tageZwischen,
  uhrzeitZuMinuten,
  vergleicheDatum,
  wochentagIso,
} from "../../src/lib/portal/format.ts";
import { clientKennung, erstelleRatenbegrenzer } from "../../src/lib/portal/rate-limit.ts";
import {
  istGueltigerToken,
  normalisiereToken,
  statusLink,
  werkstattLink,
  TOKEN_MUSTER,
} from "../../src/lib/portal/token.ts";

const TOKEN = "eeeeeeee-0000-4000-8000-000000000001";

describe("Token", () => {
  it("akzeptiert nur UUIDs im richtigen Format", () => {
    assert.equal(istGueltigerToken(TOKEN), true);
    assert.equal(istGueltigerToken(TOKEN.toUpperCase()), false, "nur Kleinbuchstaben");
    assert.equal(istGueltigerToken("nicht-ganz-richtig"), false);
    assert.equal(istGueltigerToken(""), false);
    assert.equal(istGueltigerToken(null), false);
    assert.equal(istGueltigerToken(12345), false);
    assert.equal(TOKEN_MUSTER.test(TOKEN), true);
  });

  it("normalisiert Großschreibung und Leerzeichen", () => {
    assert.equal(normalisiereToken(`  ${TOKEN.toUpperCase()}  `), TOKEN);
    assert.equal(normalisiereToken("   "), null);
    assert.equal(normalisiereToken(undefined), null);
  });

  it("baut die öffentlichen Links", () => {
    assert.equal(statusLink(TOKEN, "https://beispiel.de"), `https://beispiel.de/status/${TOKEN}`);
    assert.equal(
      werkstattLink("kfz-werkstatt-berger", "https://beispiel.de/"),
      "https://beispiel.de/w/kfz-werkstatt-berger",
    );
  });
});

describe("Akzentfarbe", () => {
  it("rechnet den Hex-Wert der Werkstatt in ein HSL-Triplett um", () => {
    assert.equal(hexZuHslTriplett("#0A6E78"), "185 85% 25%");
    assert.equal(hexZuHslTriplett("#ffffff"), "0 0% 100%");
    assert.equal(hexZuHslTriplett("#000000"), "0 0% 0%");
    assert.equal(hexZuHslTriplett("#f00"), "0 100% 50%");
  });

  it("bleibt bei fehlenden oder ungültigen Werten beim Standard (Petrol)", () => {
    assert.equal(hexZuHslTriplett(null), PETROL_TRIPLETT);
    assert.equal(hexZuHslTriplett("nicht-gültig"), PETROL_TRIPLETT);
    assert.equal(hexZuHslTriplett("#12345"), PETROL_TRIPLETT);
    assert.equal(hexZuHslTriplett(undefined), "188 86% 27%");
  });

  it("liefert eine helle Flächenfarbe zur Akzentfarbe", () => {
    assert.equal(hexZuWeichemTriplett("#0A6E78"), "185 60% 96%");
    assert.equal(hexZuWeichemTriplett(null), "188 60% 96%");
  });
});

describe("Fehlertexte", () => {
  it("übersetzt die Kennungen der Datenbankfunktion", () => {
    assert.match(uebersetzeDbFehler('ERROR: werkstatt_unbekannt'), /nicht bekannt/);
    assert.match(
      uebersetzeDbFehler('ERROR: P0001: zu_viele_anfragen'),
      /mehrere Anfragen/,
    );
    assert.match(uebersetzeDbFehler("zu_schnell"), /warten Sie eine Minute/);
    assert.match(uebersetzeDbFehler("eingabe_ungueltig"), /unvollständig/);
  });

  it("zeigt bei unbekannten Fehlern einen neutralen deutschen Satz", () => {
    assert.equal(uebersetzeDbFehler("irgendwas anderes"), FEHLER_STANDARD);
    assert.equal(uebersetzeDbFehler(null), FEHLER_STANDARD);
    assert.equal(uebersetzeDbFehler(undefined), FEHLER_STANDARD);
  });
});

describe("Ratenbegrenzung", () => {
  it("erlaubt Anfragen bis zur Grenze und bremst danach", () => {
    let zeit = 0;
    const begrenzer = erstelleRatenbegrenzer({ max: 3, fensterMs: 60_000, jetzt: () => zeit });

    assert.equal(begrenzer.pruefe("kunde-1").erlaubt, true);
    assert.equal(begrenzer.pruefe("kunde-1").erlaubt, true);
    assert.equal(begrenzer.pruefe("kunde-1").erlaubt, true);

    const gebremst = begrenzer.pruefe("kunde-1");
    assert.equal(gebremst.erlaubt, false);
    assert.equal(gebremst.warteSekunden, 60);

    // Nach Ablauf des Fensters ist der Zähler wieder frei.
    zeit = 60_001;
    assert.equal(begrenzer.pruefe("kunde-1").erlaubt, true);
  });

  it("zählt jede Kennung getrennt", () => {
    const begrenzer = erstelleRatenbegrenzer({ max: 1, fensterMs: 1000 });
    assert.equal(begrenzer.pruefe("a").erlaubt, true);
    assert.equal(begrenzer.pruefe("b").erlaubt, true);
    assert.equal(begrenzer.pruefe("a").erlaubt, false);
  });

  it("liest die Kennung aus den Kopfzeilen", () => {
    const kopf = (werte: Record<string, string>) => ({
      get: (name: string) => werte[name] ?? null,
    });
    assert.equal(clientKennung(kopf({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
    assert.equal(clientKennung(kopf({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
    assert.equal(clientKennung(kopf({})), "unbekannt");
    assert.equal(clientKennung(null), "unbekannt");
  });
});

describe("Formatierung", () => {
  it("prüft Datumsangaben", () => {
    assert.equal(istIsoDatum("2026-10-05"), true);
    assert.equal(istIsoDatum("2026-02-30"), false);
    assert.equal(istIsoDatum("2026-2-5"), false);
    assert.equal(istIsoDatum("05.10.2026"), false);
    assert.equal(istIsoDatum(null), false);
  });

  it("rechnet mit naiven Werkstatt-Daten", () => {
    assert.equal(wochentagIso("2026-10-05"), 1); // Montag
    assert.equal(wochentagIso("2026-10-11"), 7); // Sonntag
    assert.equal(datumPlusTage("2026-10-31", 1), "2026-11-01");
    assert.equal(datumPlusTage("2026-01-01", -1), "2025-12-31");
    assert.equal(tageZwischen("2026-10-05", "2026-10-08"), 3);
    assert.equal(tageZwischen("2026-10-08", "2026-10-05"), -3);
    assert.ok(vergleicheDatum("2026-10-05", "2026-10-06") < 0);
  });

  it("schreibt Daten auf Deutsch", () => {
    assert.equal(formatiereDatum("2026-10-05"), "05.10.2026");
    assert.equal(formatiereDatumLang("2026-10-05"), "Montag, 5. Oktober 2026");
    assert.equal(formatiereDatumKurz("2026-10-05"), "Mo, 05.10.");
    assert.equal(formatiereMonat(2026, 10), "Oktober 2026");
    assert.equal(formatiereDatum("quatsch"), "—");
  });

  it("rechnet Uhrzeiten in Minuten und zurück", () => {
    assert.equal(uhrzeitZuMinuten("07:30"), 450);
    assert.equal(uhrzeitZuMinuten("07:30:00"), 450);
    assert.equal(uhrzeitZuMinuten("25:00"), null);
    assert.equal(uhrzeitZuMinuten(""), null);
    assert.equal(uhrzeitZuMinuten(null), null);
    assert.equal(formatiereMinute(450), "07:30");
    assert.equal(formatiereSlot(450, 510), "07:30–08:30 Uhr");
  });

  it("rechnet Minuten zwischen zwei naiven Zeitpunkten", () => {
    assert.equal(minutenZwischen("2026-10-05T07:00", "2026-10-06T07:00"), 24 * 60);
    assert.equal(minutenZwischen("2026-10-05T07:00", "2026-10-05T07:30"), 30);
    assert.ok(Number.isNaN(minutenZwischen("unsinn", "2026-10-05T07:00")));
  });

  it("bestimmt die Werkstatt-Zeit unabhängig von der Server-Zeitzone", () => {
    const zeitpunkt = new Date("2026-10-05T05:30:00Z");
    assert.equal(jetztInZeitzone("Europe/Berlin", zeitpunkt), "2026-10-05T07:30");
    assert.equal(jetztInZeitzone("", zeitpunkt), "2026-10-05T07:30");
  });

  it("formatiert Zeitstempel und naive Zeiten auf Deutsch", () => {
    assert.equal(formatiereZeitstempel("2026-10-05T12:00:00Z"), "05.10.2026, 14:00 Uhr");
    assert.equal(formatiereZeitstempel(null), "—");
    assert.equal(formatiereNaiveZeit("2026-10-05T08:00:00"), "05.10.2026, 08:00 Uhr");
    assert.equal(formatiereNaiveZeit(""), "—");
  });
});
