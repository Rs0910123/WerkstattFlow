/**
 * Tests für die Preisschätzung (src/lib/portal/preisschaetzung.ts).
 *
 * Reine Logik: Das Bezugsjahr wird übergeben, damit die Tests nicht altern.
 * Rundungsregel: Untergrenze abwärts, Obergrenze aufwärts auf volle 5 Euro.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatierePreisAb,
  formatiereSpanne,
  PREISSCHAETZUNG_HINWEIS,
  schaetzePreis,
} from "../../src/lib/portal/preisschaetzung.ts";

const JAHR = 2026;

describe("schaetzePreis", () => {
  it("liefert den Preisrahmen der Leistung ohne Zuschläge", () => {
    const schaetzung = schaetzePreis("Inspektion / Wartung", {}, JAHR);
    assert.equal(schaetzung?.min, 245);
    assert.equal(schaetzung?.max, 430);
    assert.deepEqual(schaetzung?.gruende, []);
    assert.equal(schaetzung?.hinweis, PREISSCHAETZUNG_HINWEIS);
  });

  it("liefert null für eine unbekannte Leistung, statt eine Zahl zu erfinden", () => {
    assert.equal(schaetzePreis("Rasen mähen", {}, JAHR), null);
    assert.equal(schaetzePreis("", {}, JAHR), null);
  });

  it("schlägt bei einem Fahrzeug ab 15 Jahren 15 % auf", () => {
    const schaetzung = schaetzePreis("Inspektion / Wartung", { baujahr: 2000 }, JAHR);
    assert.equal(schaetzung?.min, 285); // 249 * 1,15 = 286,35 → abgerundet 285
    assert.equal(schaetzung?.max, 495); // 429 * 1,15 = 493,35 → aufgerundet 495
    assert.deepEqual(schaetzung?.gruende, ["Fahrzeug älter als 15 Jahre (+15 %)"]);
  });

  it("schlägt bei einem Fahrzeug ab 10 Jahren 8 % auf", () => {
    const schaetzung = schaetzePreis("Ölwechsel", { baujahr: 2014 }, JAHR);
    assert.equal(schaetzung?.min, 95); //  89 * 1,08 = 96,12 → 95
    assert.equal(schaetzung?.max, 175); // 159 * 1,08 = 171,72 → 175
  });

  it("lässt ein Fahrzeug unter 10 Jahren ohne Alterszuschlag", () => {
    const schaetzung = schaetzePreis("Ölwechsel", { baujahr: 2020 }, JAHR);
    assert.equal(schaetzung?.min, 85);
    assert.equal(schaetzung?.max, 160);
  });

  it("rechnet Alter und Laufleistung zusammen", () => {
    const schaetzung = schaetzePreis(
      "Inspektion / Wartung",
      { baujahr: 2000, kilometerstand: 260_000 },
      JAHR,
    );
    assert.equal(schaetzung?.min, 320); // 249 * 1,30 = 323,7 → 320
    assert.equal(schaetzung?.max, 560); // 429 * 1,30 = 557,7 → 560
    assert.equal(schaetzung?.gruende.length, 2);
  });

  it("stuft die Laufleistung erst ab 150.000 km hoch", () => {
    const knapp = schaetzePreis("Ölwechsel", { kilometerstand: 149_000 }, JAHR);
    assert.equal(knapp?.min, 85);

    const drueber = schaetzePreis("Ölwechsel", { kilometerstand: 150_000 }, JAHR);
    assert.equal(drueber?.min, 95);
  });

  it("zieht bei einem Elektrofahrzeug 10 % ab — aber nur bei der Inspektion", () => {
    const inspektion = schaetzePreis(
      "Inspektion / Wartung",
      { kraftstoff: "elektro" },
      JAHR,
    );
    assert.equal(inspektion?.min, 220); // 249 * 0,90 = 224,1 → 220
    assert.equal(inspektion?.max, 390); // 429 * 0,90 = 386,1 → 390

    const oelwechsel = schaetzePreis("Ölwechsel", { kraftstoff: "elektro" }, JAHR);
    assert.equal(oelwechsel?.min, 85);
    assert.equal(oelwechsel?.max, 160);
  });

  it("ignoriert unsinnige Fahrzeugangaben", () => {
    const schaetzung = schaetzePreis(
      "Ölwechsel",
      { baujahr: 1700, kilometerstand: -5 },
      JAHR,
    );
    assert.equal(schaetzung?.min, 85);
    assert.deepEqual(schaetzung?.gruende, []);
  });

  it("rundet beide Grenzen auf volle 5 Euro", () => {
    const schaetzung = schaetzePreis("Klimaservice", {}, JAHR);
    assert.equal(schaetzung?.min, 95);
    assert.equal(schaetzung?.max, 190);
    assert.equal((schaetzung?.min ?? 0) % 5, 0);
    assert.equal((schaetzung?.max ?? 0) % 5, 0);
  });

  it("hält die Spanne in jeder Lage plausibel", () => {
    for (const leistung of [
      "Inspektion / Wartung",
      "Ölwechsel",
      "Bremsen-Service",
      "Unfallschaden / Karosserie",
    ]) {
      const schaetzung = schaetzePreis(
        leistung,
        { baujahr: 1998, kilometerstand: 320_000, kraftstoff: "diesel" },
        JAHR,
      );
      assert.ok(schaetzung);
      assert.ok(schaetzung.min > 0, `${leistung}: Untergrenze fehlt`);
      assert.ok(
        schaetzung.max >= schaetzung.min,
        `${leistung}: Obergrenze liegt unter der Untergrenze`,
      );
    }
  });
});

describe("Preisformatierung", () => {
  it("formatiert eine Spanne", () => {
    assert.equal(formatiereSpanne(245, 430), "245 € – 430 €");
    assert.equal(formatiereSpanne(100, 100), "100 €");
  });

  it("formatiert einen Einstiegspreis", () => {
    assert.equal(formatierePreisAb(249), "ab 249 €");
  });
});
