/**
 * Tests für den Absendeweg und die Statusseite (Baustein 2, Teil B) — ohne
 * Supabase und ohne Browser prüfbar:
 *   - Schrittfolge und Schrittprüfung des Formulars (anfrage-schritte.ts),
 *   - serverseitige Preisschätzung und Fehlerfälle (anfrage.ts),
 *   - Statusbeschreibungen und Token-zu-Link (status.ts, token.ts).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EINWILLIGUNG_FELD,
  HONEYPOT_FELD,
  parseAnfrageFormular,
} from "../../src/lib/portal/anfrage-schema.ts";
import {
  ANFRAGE_SCHRITTE,
  ANZAHL_SCHRITTE,
  ersterSchrittMitFehler,
  felderDesSchritts,
  istSchrittVollstaendig,
  pruefeSchritt,
  sortiereFehler,
} from "../../src/lib/portal/anfrage-schritte.ts";
import {
  TEXT_OFFLINE,
  leseAntwort,
  preisAusDaten,
  verarbeiteAnfrage,
  werteFuerFormular,
  zeitnotizAusSlot,
  type SendeAnfrage,
} from "../../src/lib/portal/anfrage.ts";
import { schaetzePreis } from "../../src/lib/portal/preisschaetzung.ts";
import { erstelleRatenbegrenzer } from "../../src/lib/portal/rate-limit.ts";
import {
  ANFRAGE_STATUS,
  beschreibeStatus,
  formatierePreisspanne,
  formatiereReferenz,
  normalisiereStatus,
  statusBadge,
} from "../../src/lib/portal/status.ts";
import { istGueltigerToken, normalisiereToken, statusLink } from "../../src/lib/portal/token.ts";

const HEUTE = "2026-10-06";
const TAG = "2026-10-08";

/** Vollständiges, gültiges Formular (Wunschtermin 08.10.2026, 08:00–09:00). */
function gueltigeEingabe(abweichungen: Record<string, unknown> = {}) {
  return {
    service_type: "Bremsen-Service",
    description: "Quietschen beim Bremsen.",
    preferred_date: TAG,
    slot_start: "08:00",
    slot_end: "09:00",
    first_name: "Anna",
    last_name: "Beispiel",
    email: "anna.beispiel@example.com",
    phone: "0202 1234567",
    contact_preference: "email",
    vehicle_make: "Volkswagen",
    vehicle_model: "Golf 7",
    vehicle_year: "2014",
    vehicle_mileage: "182000",
    vehicle_fuel_type: "diesel",
    license_plate: "wu-ab 123",
    [EINWILLIGUNG_FELD]: "on",
    ...abweichungen,
  };
}

const ruhigerLimiter = () => erstelleRatenbegrenzer({ max: 100 });

const KONTEXT = {
  slug: "kfz-werkstatt-berger",
  heute: HEUTE,
  kennung: "203.0.113.7",
  verbunden: true,
};

/** Absender, der alles mitschreibt und eine gültige Antwort liefert. */
function aufzeichnenderAbsender(antwort: unknown = [{ public_token: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0", reference: "WF-2026-0001" }]) {
  const gesendet: SendeAnfrage[] = [];
  return {
    gesendet,
    absender: async (anfrage: SendeAnfrage) => {
      gesendet.push(anfrage);
      return { fehler: null, data: antwort };
    },
  };
}

describe("Schrittfolge des Formulars", () => {
  it("hat vier benannte Schritte auf Deutsch", () => {
    assert.equal(ANZAHL_SCHRITTE, 4);
    assert.deepEqual(
      ANFRAGE_SCHRITTE.map((schritt) => schritt.titel),
      ["Anliegen", "Fahrzeug", "Kontakt", "Abschluss"],
    );
    for (const schritt of ANFRAGE_SCHRITTE) {
      assert.ok(schritt.beschreibung.length > 10, `Beschreibung fehlt: ${schritt.titel}`);
    }
  });

  it("prüft in Schritt 1 die Leistung, nicht die Kontaktdaten", () => {
    const fehler = pruefeSchritt({}, 0, { heute: HEUTE });
    assert.ok(fehler.service_type, "Leistung muss verlangt werden");
    assert.equal(fehler.first_name, undefined, "Kontakt gehört nicht in Schritt 1");
    assert.equal(fehler.license_plate, undefined, "Fahrzeug gehört nicht in Schritt 1");
  });

  it("meldet in Schritt 1 auch einen fehlenden Wunschtermin", () => {
    const fehler = pruefeSchritt({ service_type: "Ölwechsel" }, 0, { heute: HEUTE });
    assert.match(fehler.preferred_date ?? "", /Wunschtermin/);
    assert.match(fehler.slot_start ?? "", /freien Termin/);
  });

  it("verlangt in Schritt 2 Kennzeichen, Marke und Modell", () => {
    const fehler = pruefeSchritt(gueltigeEingabe({ license_plate: "", vehicle_make: "", vehicle_model: "" }), 1, { heute: HEUTE });
    assert.match(fehler.license_plate, /Kennzeichen/);
    assert.match(fehler.vehicle_make, /Marke/);
    assert.match(fehler.vehicle_model, /Modell/);
    assert.equal(fehler.email, undefined);
  });

  it("verlangt in Schritt 3 die Einwilligung und einen Kontaktweg", () => {
    const fehler = pruefeSchritt(
      gueltigeEingabe({ [EINWILLIGUNG_FELD]: "", email: "", phone: "" }),
      2,
      { heute: HEUTE },
    );
    assert.match(fehler[EINWILLIGUNG_FELD], /kontaktieren/);
    assert.match(fehler.email, /E-Mail-Adresse oder eine Telefonnummer/);
    assert.match(fehler.phone, /erforderlich/);
  });

  it("verlangt für Rückruf/SMS eine Telefonnummer", () => {
    const fehler = pruefeSchritt(
      gueltigeEingabe({ phone: "", contact_preference: "telefon" }),
      2,
      { heute: HEUTE },
    );
    assert.match(fehler.contact_preference, /Telefonnummer/);
  });

  it("lässt ein vollständiges Formular alle Schritte passieren", () => {
    for (let schritt = 0; schritt < ANZAHL_SCHRITTE; schritt += 1) {
      assert.equal(
        istSchrittVollstaendig(gueltigeEingabe(), schritt, { heute: HEUTE }),
        true,
        `Schritt ${schritt + 1} müsste vollständig sein`,
      );
    }
  });

  it("springt nach einem Serverfehler in den richtigen Schritt", () => {
    assert.equal(ersterSchrittMitFehler({ vehicle_make: "x" }), 1);
    assert.equal(ersterSchrittMitFehler({ service_type: "x" }), 0);
    assert.equal(ersterSchrittMitFehler({ [EINWILLIGUNG_FELD]: "x" }), 2);
    assert.equal(ersterSchrittMitFehler({ preferred_date: "x" }), 0);
    assert.equal(ersterSchrittMitFehler({}), -1);
  });

  it("sortiert Fehlermeldungen in Formularreihenfolge", () => {
    const sortiert = sortiereFehler({ license_plate: "b", service_type: "a" });
    assert.deepEqual(sortiert.map((eintrag) => eintrag.feld), ["service_type", "license_plate"]);
  });

  it("kennt den Honeypot in keinem sichtbaren Schritt", () => {
    const sichtbar = ANFRAGE_SCHRITTE.flatMap((schritt) => schritt.felder);
    assert.equal(sichtbar.includes(HONEYPOT_FELD), false);
    assert.ok(felderDesSchritts(0).includes("preferred_date"));
  });
});

describe("Absenden der Anfrage (Serverlogik)", () => {
  it("berechnet die Preisspanne serverseitig und ignoriert Browserwerte", async () => {
    const { gesendet, absender } = aufzeichnenderAbsender();
    const ergebnis = await verarbeiteAnfrage(
      gueltigeEingabe({
        // Diese Werte schickt ein manipulierter Browser mit — sie dürfen NICHT
        // in die Datenbank gelangen.
        estimated_price_min: "1",
        estimated_price_max: "2",
        price_estimate_note: "1 € bis 2 €",
      }),
      KONTEXT,
      { limiter: ruhigerLimiter(), absenden: absender },
    );

    assert.equal(ergebnis.erfolg, true);
    const erwartet = schaetzePreis("Bremsen-Service", {
      baujahr: 2014,
      kilometerstand: 182000,
      kraftstoff: "diesel",
    });
    assert.ok(erwartet);
    assert.equal(gesendet.length, 1);
    assert.deepEqual(gesendet[0].preis, erwartet);
    assert.equal(gesendet[0].preis?.min, erwartet?.min);
    assert.notEqual(gesendet[0].preis?.min, 1);
    assert.equal(gesendet[0].preis?.hinweis, erwartet?.hinweis);
  });

  it("leitet den Mandanten ausschließlich aus dem Slug ab", async () => {
    const { gesendet, absender } = aufzeichnenderAbsender();
    await verarbeiteAnfrage(gueltigeEingabe(), { ...KONTEXT, slug: "Kfz-Werkstatt-Berger " }, {
      limiter: ruhigerLimiter(),
      absenden: absender,
    });
    assert.equal(gesendet[0].slug, "kfz-werkstatt-berger");
  });

  it("macht aus dem gewählten Slot eine lesbare Terminnotiz", async () => {
    const { gesendet, absender } = aufzeichnenderAbsender();
    await verarbeiteAnfrage(gueltigeEingabe({ slot_start: "07:30", slot_end: "08:30" }), KONTEXT, {
      limiter: ruhigerLimiter(),
      absenden: absender,
    });
    assert.equal(gesendet[0].zeitnotiz, "07:30–08:30 Uhr");
    assert.equal(gesendet[0].daten.preferred_date, TAG);
    assert.equal(gesendet[0].daten.license_plate, "WU-AB 123");
  });

  it("liefert Token und Referenz als Erfolg zurück", async () => {
    const ergebnis = await verarbeiteAnfrage(gueltigeEingabe(), KONTEXT, {
      limiter: ruhigerLimiter(),
      absenden: aufzeichnenderAbsender().absender,
    });
    assert.equal(ergebnis.erfolg, true);
    if (ergebnis.erfolg) {
      assert.ok(istGueltigerToken(ergebnis.publicToken));
      assert.equal(ergebnis.reference, "WF-2026-0001");
      assert.equal(statusLink(ergebnis.publicToken, "https://werkstatt.example"), `https://werkstatt.example/status/${ergebnis.publicToken}`);
    }
  });

  it("verwirft gefüllte Honeypot-Felder ohne Datenbankaufruf", async () => {
    const { gesendet, absender } = aufzeichnenderAbsender();
    const ergebnis = await verarbeiteAnfrage(
      gueltigeEingabe({ [HONEYPOT_FELD]: "http://spam.example" }),
      KONTEXT,
      { limiter: ruhigerLimiter(), absenden: absender },
    );
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      assert.equal(ergebnis.art, "spam");
      assert.deepEqual(ergebnis.werte, {});
    }
    assert.equal(gesendet.length, 0);
  });

  it("begrenzt zu viele Absendungen mit deutscher Meldung", async () => {
    const limiter = erstelleRatenbegrenzer({ max: 1 });
    const { absender } = aufzeichnenderAbsender();
    const erster = await verarbeiteAnfrage(gueltigeEingabe(), KONTEXT, { limiter, absenden: absender });
    const zweiter = await verarbeiteAnfrage(gueltigeEingabe(), KONTEXT, { limiter, absenden: absender });
    assert.equal(erster.erfolg, true);
    assert.equal(zweiter.erfolg, false);
    if (!zweiter.erfolg) {
      assert.equal(zweiter.art, "begrenzt");
      assert.match(zweiter.meldung, /Sekunden/);
      assert.equal(zweiter.werte.first_name, "Anna");
    }
  });

  it("verbraucht das Kontingent nicht mit ungültigen Eingaben", async () => {
    const limiter = erstelleRatenbegrenzer({ max: 1 });
    const { absender } = aufzeichnenderAbsender();
    for (let versuch = 0; versuch < 3; versuch += 1) {
      const fehlerhaft = await verarbeiteAnfrage(gueltigeEingabe({ first_name: "" }), KONTEXT, { limiter, absenden: absender });
      assert.equal(fehlerhaft.erfolg, false);
      if (!fehlerhaft.erfolg) assert.equal(fehlerhaft.art, "eingabe");
    }
    const gueltig = await verarbeiteAnfrage(gueltigeEingabe(), KONTEXT, { limiter, absenden: absender });
    assert.equal(gueltig.erfolg, true);
  });

  it("gibt bei ungültiger Eingabe deutsche Feldfehler und die Werte zurück", async () => {
    const { gesendet, absender } = aufzeichnenderAbsender();
    const ergebnis = await verarbeiteAnfrage(
      gueltigeEingabe({ email: "keine-adresse", [EINWILLIGUNG_FELD]: "" }),
      KONTEKT_NEU(),
      { limiter: ruhigerLimiter(), absenden: absender },
    );
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      assert.equal(ergebnis.art, "eingabe");
      assert.match(ergebnis.fehler.email, /gültige E-Mail-Adresse/);
      assert.match(ergebnis.fehler[EINWILLIGUNG_FELD], /kontaktieren/);
      assert.equal(ergebnis.werte.first_name, "Anna", "Eingaben bleiben erhalten");
      assert.equal(ergebnis.werte[HONEYPOT_FELD], undefined);
    }
    assert.equal(gesendet.length, 0);
  });

  it("meldet ohne Datenbankverbindung einen deutschen Hinweis und speichert nichts", async () => {
    const { gesendet, absender } = aufzeichnenderAbsender();
    const ergebnis = await verarbeiteAnfrage(gueltigeEingabe(), { ...KONTEXT, verbunden: false }, {
      limiter: ruhigerLimiter(),
      absenden: absender,
    });
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      assert.equal(ergebnis.art, "offline");
      assert.equal(ergebnis.meldung, TEXT_OFFLINE);
      assert.match(ergebnis.meldung, /Datenbank verbunden/);
    }
    assert.equal(gesendet.length, 0);
  });

  it("übersetzt Datenbankfehler ins Deutsche (zu schnell, Werkstatt unbekannt)", async () => {
    const zuSchnell = await verarbeiteAnfrage(gueltigeEingabe(), KONTEXT, {
      limiter: ruhigerLimiter(),
      absenden: async () => ({ fehler: { message: 'P0001: zu_schnell' } }),
    });
    assert.equal(zuSchnell.erfolg, false);
    if (!zuSchnell.erfolg) {
      assert.equal(zuSchnell.art, "technisch");
      assert.match(zuSchnell.meldung, /warten Sie eine Minute/);
      assert.equal(zuSchnell.werte.email, "anna.beispiel@example.com");
    }

    const unbekannt = await verarbeiteAnfrage(gueltigeEingabe(), KONTEXT, {
      limiter: ruhigerLimiter(),
      absenden: async () => ({ fehler: { message: "werkstatt_unbekannt" } }),
    });
    assert.equal(unbekannt.erfolg, false);
    if (!unbekannt.erfolg) {
      assert.equal(unbekannt.art, "werkstatt");
      assert.match(unbekannt.meldung, /nicht bekannt/);
    }
  });

  it("meldet einen fehlenden Slug als unbekannte Werkstatt", async () => {
    const { gesendet, absender } = aufzeichnenderAbsender();
    const ergebnis = await verarbeiteAnfrage(gueltigeEingabe(), { ...KONTEXT, slug: "  " }, {
      limiter: ruhigerLimiter(),
      absenden: absender,
    });
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) assert.equal(ergebnis.art, "werkstatt");
    assert.equal(gesendet.length, 0);
  });

  it("fängt eine unerwartete Ausnahme des Absenders ab", async () => {
    const ergebnis = await verarbeiteAnfrage(gueltigeEingabe(), KONTEKT_NEU(), {
      limiter: ruhigerLimiter(),
      absenden: async () => {
        throw new Error("Netzwerk weg");
      },
    });
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      assert.equal(ergebnis.art, "technisch");
      assert.match(ergebnis.meldung, /konnte gerade nicht übermittelt werden/);
    }
  });

  it("erkennt eine unbrauchbare Datenbankantwort", () => {
    assert.equal(leseAntwort([]), null);
    assert.equal(leseAntwort(null), null);
    assert.equal(leseAntwort([{ reference: "WF-1" }]), null);
    assert.deepEqual(leseAntwort([{ public_token: "abc", reference: "WF-1" }]), {
      publicToken: "abc",
      reference: "WF-1",
    });
  });

  it("bereitet die Werte für das erneute Anzeigen auf", () => {
    const werte = werteFuerFormular(gueltigeEingabe({ vehicle_year: 2014, [HONEYPOT_FELD]: "x" }));
    assert.equal(werte.vehicle_year, "2014");
    assert.equal(werte.license_plate, "wu-ab 123");
    assert.equal(werte[HONEYPOT_FELD], undefined);
  });

  it("formatiert Terminnotizen robust", () => {
    assert.equal(zeitnotizAusSlot("08:00", "09:00"), "08:00–09:00 Uhr");
    assert.equal(zeitnotizAusSlot("", ""), "Wunschtermin aus dem Kalender");
    assert.equal(zeitnotizAusSlot("08:00", ""), "Wunschtermin ab 08:00 Uhr");
  });

  it("berechnet den Preis aus den geprüften Fahrzeugdaten", () => {
    const geprueft = parseAnfrageFormular(gueltigeEingabe({ vehicle_fuel_type: "elektro", service_type: "Inspektion / Wartung", vehicle_year: "2021", vehicle_mileage: "20000" }), { heute: HEUTE });
    assert.equal(geprueft.erfolg, true);
    if (geprueft.erfolg) {
      const preis = preisAusDaten(geprueft.daten);
      assert.deepEqual(preis?.min, 220);
      assert.ok(preis && preis.max > preis.min);
      assert.equal(preis?.gruende.length, 1, "Elektro-Inspektion hat einen Abzug");
    }
  });
});

function KONTEKT_NEU() {
  return { ...KONTEXT };
}

describe("Statuslogik der Statusseite", () => {
  it("kennt genau die Statuswerte der Datenbank", () => {
    assert.deepEqual([...ANFRAGE_STATUS], [
      "neu",
      "bestaetigt",
      "abgelehnt",
      "abgeschlossen",
      "storniert",
    ]);
  });

  it("behandelt unbekannte Status als 'neu'", () => {
    assert.equal(normalisiereStatus("bestaetigt"), "bestaetigt");
    assert.equal(normalisiereStatus("BESTAETIGT"), "bestaetigt");
    assert.equal(normalisiereStatus("quatsch"), "neu");
    assert.equal(normalisiereStatus(null), "neu");
    assert.equal(normalisiereStatus(undefined), "neu");
  });

  it("liefert für jeden Status eine Badge-Variante", () => {
    for (const status of ANFRAGE_STATUS) assert.equal(statusBadge(status), status);
    assert.equal(statusBadge("unbekannt"), "neu");
  });

  it("beschreibt jeden Status auf Deutsch mit nächsten Schritten", () => {
    for (const status of ANFRAGE_STATUS) {
      const text = beschreibeStatus(status);
      assert.ok(text.titel.length > 5, `Titel fehlt für ${status}`);
      assert.ok(text.kurz.endsWith("."), `Kurzsatz fehlt für ${status}`);
      assert.ok(text.nachricht.length > 60, `Nachricht zu kurz für ${status}`);
      assert.ok(text.naechsteSchritte.length >= 2, `Schritte fehlen für ${status}`);
    }
  });

  it("setzt den Werkstattnamen und den Ablehnungsgrund ein", () => {
    const text = beschreibeStatus("abgelehnt", {
      werkstattName: "Kfz-Werkstatt Berger",
      ablehnungsgrund: "Keine Kapazität in dieser Woche.",
    });
    assert.match(text.nachricht, /Keine Kapazität in dieser Woche\./);
    assert.equal(beschreibeStatus("neu", { werkstattName: "Kfz-Werkstatt Berger" }).nachricht.includes("Die Werkstatt"), false);
  });

  it("formatiert Referenznummer und Preisspanne", () => {
    assert.equal(formatiereReferenz("wf-2026-0001"), "WF-2026-0001");
    assert.equal(formatiereReferenz(null), "—");
    assert.equal(formatierePreisspanne(249, 429), "249 € – 429 €");
    assert.equal(formatierePreisspanne(249, 249), "249 €");
    assert.equal(formatierePreisspanne(null, null), null);
    assert.equal(formatierePreisspanne(null, 429), "bis 429 €");
  });

  it("leitet aus einem Token genau einen Statustext ab (kein Token → 404-Fall)", () => {
    const token = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
    assert.equal(statusLink(token, "https://werkstatt.example/"), `https://werkstatt.example/status/${token}`);
    assert.equal(statusLink(token, ""), `/status/${token}`);
    assert.equal(normalisiereToken("  " + token.toUpperCase() + "  "), token);
    assert.equal(normalisiereToken(""), null, "leerer Token führt zur 404-Seite");
    assert.equal(normalisiereToken("fast-ein-token"), null);
    assert.equal(normalisiereToken(null), null);
  });
});
