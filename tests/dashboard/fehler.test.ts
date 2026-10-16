/**
 * Tests der Fehlerübersetzung des Dashboards (src/lib/dashboard/fehler.ts).
 *
 * Jeder Fehler aus der Datenbank muss in der Oberfläche als verständlicher
 * deutscher Satz ankommen — nie als englischer Postgres- oder RLS-Text.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DASHBOARD_FEHLER,
  DASHBOARD_FEHLER_STANDARD,
  istRlsAbweisung,
  uebersetzeDashboardFehler,
} from "../../src/lib/dashboard/fehler.ts";

describe("Fehlerübersetzung im Dashboard", () => {
  it("kennt alle Kennungen der Dashboard-Funktionen", () => {
    for (const kennung of [
      "anfrage_unbekannt",
      "status_ungueltig",
      "termin_kollision",
      "termin_ungueltig",
      "begruendung_fehlt",
      "eingabe_ungueltig",
    ]) {
      assert.ok(DASHBOARD_FEHLER[kennung], `Kennung ${kennung} fehlt`);
    }
  });

  it("übersetzt jede Kennung in einen deutschen Satz", () => {
    for (const [kennung, meldung] of Object.entries(DASHBOARD_FEHLER)) {
      assert.equal(uebersetzeDashboardFehler(`ERROR: ${kennung}`), meldung, kennung);
      assert.ok(meldung.length > 20, kennung);
      assert.ok(!/[a-z]+_[a-z]+/.test(meldung), `${kennung} darf keine Kennung anzeigen`);
    }
  });

  it("erkennt Kennungen auch mitten im Text und in Fehlerobjekten", () => {
    assert.match(uebersetzeDashboardFehler("termin_kollision"), /bereits ein Termin/);
    assert.match(
      uebersetzeDashboardFehler(new Error("ERROR: begruendung_fehlt\nDETAIL: ...")),
      /Begründung/,
    );
    assert.match(
      uebersetzeDashboardFehler({ message: "status_ungueltig", code: "P0001" }),
      /inzwischen bearbeitet/,
    );
  });

  it("erklärt eine Ablehnung des Datenbankschutzes auf Deutsch", () => {
    const meldung = uebersetzeDashboardFehler(
      'ERROR: new row violates row-level security policy for table "requests"',
    );
    assert.equal(meldung, "Diese Anfrage gehört nicht zu Ihrer Werkstatt. Zugriff verweigert.");
    assert.equal(istRlsAbweisung("permission denied for table requests"), true);
    assert.equal(istRlsAbweisung("termin_kollision"), false);
  });

  it("fällt sonst auf eine neutrale deutsche Meldung zurück", () => {
    assert.equal(uebersetzeDashboardFehler(null), DASHBOARD_FEHLER_STANDARD);
    assert.equal(uebersetzeDashboardFehler(undefined), DASHBOARD_FEHLER_STANDARD);
    assert.equal(uebersetzeDashboardFehler(42), DASHBOARD_FEHLER_STANDARD);
    assert.equal(uebersetzeDashboardFehler("Verbindung fehlgeschlagen"), DASHBOARD_FEHLER_STANDARD);
    assert.equal(uebersetzeDashboardFehler(new Error("")), DASHBOARD_FEHLER_STANDARD);
    assert.equal(
      uebersetzeDashboardFehler("duplicate key value violates unique constraint"),
      "Für diese Anfrage gibt es bereits einen Termin. Bitte laden Sie die Seite neu.",
    );
  });
});
