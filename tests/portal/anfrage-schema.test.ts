/**
 * Tests für die Validierung des Anfrageformulars
 * (src/lib/portal/anfrage-schema.ts) — deutsche Fehlermeldungen inklusive.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  EINWILLIGUNG_FELD,
  formDataZuObjekt,
  HONEYPOT_FELD,
  istHoneypotGefuellt,
  parseAnfrageFormular,
} from "../../src/lib/portal/anfrage-schema.ts";

/** Montag, 05.10.2026. */
const HEUTE = "2026-10-05";

function gueltigeAnfrage(): Record<string, unknown> {
  return {
    service_type: "Inspektion / Wartung",
    description: "  Unregelmäßiges Ruckeln beim Beschleunigen.  ",
    preferred_date: "2026-10-08",
    slot_start: "08:00",
    slot_end: "09:00",
    first_name: "  Sabine ",
    last_name: "Hoffmann",
    email: " sabine.hoffmann@example.com ",
    phone: "",
    contact_preference: "email",
    vehicle_make: "Volkswagen",
    vehicle_model: "Golf 7",
    license_plate: " s-go 1234 ",
    vehicle_year: "2018",
    vehicle_mileage: "118.400 km",
    vehicle_fuel_type: "diesel",
    [EINWILLIGUNG_FELD]: "on",
  };
}

function pruefe(werte: Record<string, unknown>) {
  return parseAnfrageFormular(werte, { heute: HEUTE });
}

describe("parseAnfrageFormular — gültige Anfrage", () => {
  it("nimmt eine vollständige Anfrage an und putzt die Werte", () => {
    const ergebnis = pruefe(gueltigeAnfrage());
    assert.equal(ergebnis.erfolg, true);
    if (!ergebnis.erfolg) return;

    assert.equal(ergebnis.daten.first_name, "Sabine");
    assert.equal(ergebnis.daten.email, "sabine.hoffmann@example.com");
    assert.equal(ergebnis.daten.license_plate, "S-GO 1234");
    assert.equal(ergebnis.daten.vehicle_mileage, 118400);
    assert.equal(ergebnis.daten.vehicle_year, 2018);
    assert.equal(ergebnis.daten.description, "Unregelmäßiges Ruckeln beim Beschleunigen.");
    assert.equal(ergebnis.daten.preferred_date, "2026-10-08");
    assert.equal(ergebnis.daten.slot_start, "08:00");
  });

  it("gibt die Einwilligung nicht an die Datenbank weiter (nur Prüfzweck)", () => {
    const ergebnis = pruefe(gueltigeAnfrage());
    assert.ok(ergebnis.erfolg);
    assert.equal(EINWILLIGUNG_FELD in ergebnis.daten, false);
  });

  it("akzeptiert eine Anfrage nur mit Telefonnummer", () => {
    const ergebnis = pruefe({
      ...gueltigeAnfrage(),
      email: "",
      phone: "0711 22334-1",
      contact_preference: "telefon",
    });
    assert.equal(ergebnis.erfolg, true);
    if (ergebnis.erfolg) {
      assert.equal(ergebnis.daten.email, null);
      assert.equal(ergebnis.daten.contact_preference, "telefon");
    }
  });

  it("erlaubt leere Beschreibung und fehlende Fahrzeugdetails", () => {
    const ergebnis = pruefe({
      ...gueltigeAnfrage(),
      description: "   ",
      vehicle_year: "",
      vehicle_mileage: "",
      vehicle_fuel_type: "unklar",
    });
    assert.equal(ergebnis.erfolg, true);
    if (ergebnis.erfolg) {
      assert.equal(ergebnis.daten.description, null);
      assert.equal(ergebnis.daten.vehicle_year, null);
      assert.equal(ergebnis.daten.vehicle_mileage, null);
      assert.equal(ergebnis.daten.vehicle_fuel_type, null);
    }
  });
});

describe("parseAnfrageFormular — Fehlerfälle", () => {
  it("verlangt die Einwilligung zur Kontaktaufnahme", () => {
    const werte = gueltigeAnfrage();
    delete werte[EINWILLIGUNG_FELD];
    const ergebnis = pruefe(werte);
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      assert.match(ergebnis.fehler[EINWILLIGUNG_FELD], /bestätigen Sie/);
    }
  });

  it("verlangt E-Mail oder Telefonnummer", () => {
    const ergebnis = pruefe({ ...gueltigeAnfrage(), email: "", phone: "" });
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      assert.match(ergebnis.fehler.email, /E-Mail-Adresse oder eine Telefonnummer/);
      assert.match(ergebnis.fehler.phone, /erforderlich/);
    }
  });

  it("verlangt eine Telefonnummer, wenn telefonisch zurückgerufen werden soll", () => {
    const ergebnis = pruefe({
      ...gueltigeAnfrage(),
      phone: "",
      contact_preference: "sms",
    });
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      assert.match(ergebnis.fehler.contact_preference, /Rückruf oder eine SMS/);
    }
  });

  it("weist einen Wunschtermin in der Vergangenheit zurück", () => {
    const ergebnis = pruefe({ ...gueltigeAnfrage(), preferred_date: "2026-10-04" });
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      assert.equal(ergebnis.fehler.preferred_date, "Der Wunschtermin liegt in der Vergangenheit.");
    }
  });

  it("weist einen Termin jenseits des Buchungshorizonts zurück", () => {
    const ergebnis = pruefe({ ...gueltigeAnfrage(), preferred_date: "2027-03-01" });
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      assert.match(ergebnis.fehler.preferred_date, /60 Tage/);
    }
  });

  it("weist ein ungültiges Datum und eine ungültige Uhrzeit zurück", () => {
    const kaputt = pruefe({
      ...gueltigeAnfrage(),
      preferred_date: "08.10.2026",
      slot_start: "8 Uhr",
    });
    assert.equal(kaputt.erfolg, false);
    if (!kaputt.erfolg) {
      assert.match(kaputt.fehler.preferred_date, /gültigen Wunschtermin/);
      assert.match(kaputt.fehler.slot_start, /freien Termin/);
    }
  });

  it("weist unbekannte Leistungen zurück", () => {
    const ergebnis = pruefe({ ...gueltigeAnfrage(), service_type: "Rasen mähen" });
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      assert.match(ergebnis.fehler.service_type, /Liste/);
    }
  });

  it("weist eine unbrauchbare E-Mail-Adresse zurück", () => {
    const ergebnis = pruefe({ ...gueltigeAnfrage(), email: "sabine(at)example" });
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      assert.match(ergebnis.fehler.email, /gültige E-Mail-Adresse/);
    }
  });

  it("weist fehlende Pflichtangaben mit Feldzuordnung zurück", () => {
    const ergebnis = pruefe({ [EINWILLIGUNG_FELD]: true });
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      for (const feld of [
        "service_type",
        "preferred_date",
        "slot_start",
        "first_name",
        "last_name",
        "vehicle_make",
        "vehicle_model",
        "license_plate",
      ]) {
        assert.ok(ergebnis.fehler[feld], `Fehler für ${feld} fehlt`);
        assert.ok(ergebnis.fehler[feld].length > 10, `Fehlertext für ${feld} ist zu knapp`);
      }
    }
  });

  it("meldet pro Feld nur den ersten Fehler (für die Anzeige am Feld)", () => {
    const ergebnis = pruefe({ ...gueltigeAnfrage(), first_name: "A" });
    assert.equal(ergebnis.erfolg, false);
    if (!ergebnis.erfolg) {
      assert.equal(Object.keys(ergebnis.fehler).length, 1);
    }
  });

  it("interpretiert unbrauchbare Kilometerangaben als 'keine Angabe'", () => {
    const ergebnis = pruefe({ ...gueltigeAnfrage(), vehicle_mileage: "weiß nicht" });
    assert.equal(ergebnis.erfolg, true);
    if (ergebnis.erfolg) assert.equal(ergebnis.daten.vehicle_mileage, null);
  });
});

describe("Spamschutz", () => {
  it("erkennt ein gefülltes Honigtopf-Feld", () => {
    assert.equal(istHoneypotGefuellt({ [HONEYPOT_FELD]: "http://spam.example" }), true);
    assert.equal(istHoneypotGefuellt({ [HONEYPOT_FELD]: "   " }), false);
    assert.equal(istHoneypotGefuellt({}), false);
  });
});

describe("formDataZuObjekt", () => {
  it("überführt ein FormData in ein einfaches Objekt", () => {
    const formData = new FormData();
    formData.set("first_name", "Sabine");
    formData.set("service_type", "Ölwechsel");
    formData.set("vehicle_year", "2018");

    const objekt = formDataZuObjekt(formData);
    assert.equal(objekt.first_name, "Sabine");
    assert.equal(objekt.service_type, "Ölwechsel");
    assert.equal(objekt.vehicle_year, "2018");
  });

  it("lässt sich direkt an die Validierung übergeben", () => {
    const formData = new FormData();
    for (const [schluessel, wert] of Object.entries(gueltigeAnfrage())) {
      formData.set(schluessel, String(wert));
    }
    const ergebnis = parseAnfrageFormular(formDataZuObjekt(formData), { heute: HEUTE });
    assert.equal(ergebnis.erfolg, true);
  });
});
