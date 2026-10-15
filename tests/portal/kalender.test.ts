/**
 * Tests für die Kalenderlogik des Kundenportals (src/lib/portal/kalender.ts).
 *
 * Ausführen:  npm test
 * Reine Logik, kein Supabase, keine echte Uhr — alle Zeiten werden übergeben.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  berechneTag,
  berechneTagesangebote,
  beschreibeOeffnungszeiten,
  erzeugeSlots,
  findeRegel,
  monatsRaster,
  naechsteFreieTage,
  VORLAUF_STUNDEN,
  type Auslastungsfenster,
  type Verfuegbarkeitsregel,
} from "../../src/lib/portal/kalender.ts";

/** Regeln wie im Demo-Seed: Mo–Do 07:30–17:00 (Kapazität 2), Fr bis 15 Uhr. */
const WOCHENTAGSREGEL = (weekday: number): Verfuegbarkeitsregel => ({
  weekday,
  specific_date: null,
  is_closed: false,
  open_time: "07:30",
  close_time: "17:00",
  slot_minutes: 60,
  capacity: 2,
  note: "Werkstatt und Annahme",
});

const REGELN: Verfuegbarkeitsregel[] = [
  WOCHENTAGSREGEL(1),
  WOCHENTAGSREGEL(2),
  WOCHENTAGSREGEL(3),
  WOCHENTAGSREGEL(4),
  {
    weekday: 5,
    specific_date: null,
    is_closed: false,
    open_time: "07:30",
    close_time: "15:00",
    slot_minutes: 60,
    capacity: 1,
    note: null,
  },
  {
    weekday: 6,
    specific_date: null,
    is_closed: false,
    open_time: "09:00",
    close_time: "12:00",
    slot_minutes: 30,
    capacity: 1,
    note: "Samstags nur Annahme",
  },
  {
    weekday: 7,
    specific_date: null,
    is_closed: true,
    open_time: null,
    close_time: null,
    slot_minutes: null,
    capacity: 1,
    note: "Sonntag geschlossen",
  },
  {
    weekday: null,
    specific_date: "2026-10-14",
    is_closed: true,
    open_time: null,
    close_time: null,
    slot_minutes: null,
    capacity: 1,
    note: "Betriebsferien",
  },
];

/** Montag, 05.10.2026, 07:00 Uhr Werkstattzeit. */
const JETZT_MONTAG_FRUEH = "2026-10-05T07:00";

function tag(datum: string, auslastung: Auslastungsfenster[] = []) {
  return berechneTag(datum, {
    regeln: REGELN,
    auslastung,
    jetzt: JETZT_MONTAG_FRUEH,
    vorlaufStunden: VORLAUF_STUNDEN,
    slotMinutenFallback: 60,
  });
}

describe("findeRegel", () => {
  it("nimmt die Wochentagsregel, wenn es keine Ausnahme gibt", () => {
    const regel = findeRegel(REGELN, "2026-10-12"); // Montag
    assert.equal(regel?.weekday, 1);
  });

  it("lässt eine konkrete Ausnahme den Wochentag überstimmen", () => {
    const regel = findeRegel(REGELN, "2026-10-14"); // Mittwoch mit Betriebsferien
    assert.equal(regel?.specific_date, "2026-10-14");
    assert.equal(regel?.is_closed, true);
  });

  it("liefert null für Wochentage ohne Regel", () => {
    const ohneDienstag = REGELN.filter((regel) => regel.weekday !== 2);
    assert.equal(findeRegel(ohneDienstag, "2026-10-13"), null);
  });
});

describe("erzeugeSlots", () => {
  it("bildet ein Raster und lässt einen Rest am Ende weg", () => {
    const slots = erzeugeSlots(7 * 60 + 30, 17 * 60, 60);
    assert.equal(slots.length, 9);
    assert.deepEqual(slots[0], { startMinute: 450, endMinute: 510 });
    assert.deepEqual(slots.at(-1), { startMinute: 930, endMinute: 990 });
  });

  it("achtet auf das Slot-Raster je Wochentag (30 Minuten samstags)", () => {
    const slots = erzeugeSlots(9 * 60, 12 * 60, 30);
    assert.equal(slots.length, 6);
  });

  it("begrenzt die Anzahl der Slots", () => {
    assert.equal(erzeugeSlots(0, 24 * 60, 15, 5).length, 5);
  });

  it("liefert nichts bei unsinnigen Zeiten", () => {
    assert.equal(erzeugeSlots(600, 480, 60).length, 0);
    assert.equal(erzeugeSlots(480, 600, 0).length, 0);
  });
});

describe("berechneTag", () => {
  it("markiert Tage in der Vorlaufzeit als 'vorlauf' statt als frei", () => {
    const montag = tag("2026-10-05");
    assert.equal(montag.zustand, "vorlauf");
    assert.equal(montag.freieSlots, 0);
    assert.match(montag.hinweis ?? "", /24 Stunden/);
    assert.ok(montag.slots.every((slot) => slot.grund === "vorlauf"));
  });

  it("gibt einen Tag nach der Vorlaufzeit vollständig frei", () => {
    const dienstag = tag("2026-10-06");
    assert.equal(dienstag.zustand, "frei");
    assert.equal(dienstag.freieSlots, 9);
    assert.equal(dienstag.oeffnungszeit, "07:30–17:00 Uhr");
    assert.equal(dienstag.slots[0].label, "07:30–08:30 Uhr");
  });

  it("drosselt nur die Slots, die zu kurzfristig sind", () => {
    const freitag = berechneTag("2026-10-09", {
      regeln: REGELN,
      auslastung: [],
      // Freitag 15:00 Uhr: das Zeitfenster ist vorbei, alles ist Vergangenheit.
      jetzt: "2026-10-09T15:00",
      vorlaufStunden: 1,
    });
    assert.equal(freitag.zustand, "vorlauf");
    assert.equal(freitag.slots.length, 7); // 07:30–15:00 in Stundenschritten
  });

  it("berücksichtigt die Kapazität eines Tages", () => {
    const eineAuslastung: Auslastungsfenster[] = [
      { day: "2026-10-06", startsMinute: 8 * 60, endsMinute: 9 * 60 },
    ];
    // Kapazität 2 → ein Termin blockiert den Slot noch nicht.
    const mitEinem = tag("2026-10-06", eineAuslastung);
    assert.equal(mitEinem.slots[0].frei, true);
    assert.equal(mitEinem.freieSlots, 9);

    const mitZweien = tag("2026-10-06", [
      ...eineAuslastung,
      { day: "2026-10-06", startsMinute: 7 * 60 + 45, endsMinute: 8 * 60 + 15 },
    ]);
    assert.equal(mitZweien.slots[0].frei, false);
    assert.equal(mitZweien.slots[0].grund, "belegt");
    assert.equal(mitZweien.freieSlots, 8);
    assert.equal(mitZweien.slots[1].frei, true);
  });

  it("zählt eine Belegung nur, wenn sie den Slot wirklich berührt", () => {
    // Ein Termin, der genau um 08:00 endet, blockiert den Slot 08:00–09:00 nicht.
    const angenzend = tag("2026-10-06", [
      { day: "2026-10-06", startsMinute: 7 * 60 + 30, endsMinute: 8 * 60 },
    ]);
    assert.equal(angenzend.slots[0].frei, true);
  });

  it("meldet einen Tag als ausgebucht, wenn alle Slots belegt sind", () => {
    // Zwei sich überschneidende Termine je Slot → Kapazität 2 ist erschöpft.
    const auslastung: Auslastungsfenster[] = erzeugeSlots(450, 17 * 60, 60).flatMap(
      (slot) => [
        {
          day: "2026-10-06",
          startsMinute: slot.startMinute,
          endsMinute: slot.endMinute,
        },
        {
          day: "2026-10-06",
          startsMinute: slot.startMinute + 15,
          endsMinute: slot.endMinute + 15,
        },
      ],
    );
    const dienstag = tag("2026-10-06", auslastung);
    assert.equal(dienstag.zustand, "ausgebucht");
    assert.equal(dienstag.freieSlots, 0);
    assert.match(dienstag.hinweis ?? "", /vergeben/);
  });

  it("erkennt geschlossene Tage und übernimmt deren Notiz", () => {
    const sonntag = tag("2026-10-11");
    assert.equal(sonntag.zustand, "geschlossen");
    assert.equal(sonntag.hinweis, "Sonntag geschlossen");
    assert.equal(sonntag.slots.length, 0);
  });

  it("hat für Wochentage ohne Regel einen verständlichen Hinweis", () => {
    const ohneRegel = berechneTag("2026-10-13", {
      regeln: REGELN.filter((regel) => regel.weekday !== 2),
      auslastung: [],
      jetzt: JETZT_MONTAG_FRUEH,
    });
    assert.equal(ohneRegel.zustand, "geschlossen");
    assert.match(ohneRegel.hinweis ?? "", /keine Termine/);
  });

  it("behandelt eine Ausnahme mit Schließung wie einen geschlossenen Tag", () => {
    const ferien = tag("2026-10-14");
    assert.equal(ferien.zustand, "geschlossen");
    assert.equal(ferien.hinweis, "Betriebsferien");
  });
});

describe("berechneTagesangebote", () => {
  it("liefert alle Tage einschließlich der Grenzen", () => {
    const tage = berechneTagesangebote({
      regeln: REGELN,
      auslastung: [],
      von: "2026-10-05",
      bis: "2026-10-11",
      jetzt: JETZT_MONTAG_FRUEH,
    });
    assert.equal(tage.length, 7);
    assert.equal(tage[0].datum, "2026-10-05");
    assert.equal(tage.at(-1)?.datum, "2026-10-11");
  });

  it("liefert nichts, wenn der Zeitraum verdreht ist", () => {
    assert.deepEqual(
      berechneTagesangebote({
        regeln: REGELN,
        auslastung: [],
        von: "2026-10-10",
        bis: "2026-10-05",
        jetzt: JETZT_MONTAG_FRUEH,
      }),
      [],
    );
  });

  it("rechnet nichts Hartcodiertes: ohne Regeln ist kein Tag frei", () => {
    const tage = berechneTagesangebote({
      regeln: [],
      auslastung: [],
      von: "2026-10-05",
      bis: "2026-10-11",
      jetzt: JETZT_MONTAG_FRUEH,
    });
    assert.ok(tage.every((eintrag) => eintrag.zustand === "geschlossen"));
    assert.equal(naechsteFreieTage(tage, 3).length, 0);
  });
});

describe("monatsRaster", () => {
  it("beginnt mit Montag und füllt auf sechs Wochen auf", () => {
    const raster = monatsRaster(2026, 10);
    assert.equal(raster.length, 42);
    // 1. Oktober 2026 ist ein Donnerstag → drei Leerzellen (Mo, Di, Mi).
    assert.deepEqual(raster.slice(0, 4), [null, null, null, "2026-10-01"]);
    assert.equal(raster.filter(Boolean).length, 31);
  });

  it("trifft auch den Februar eines Schaltjahrs", () => {
    const raster = monatsRaster(2028, 2);
    assert.equal(raster.filter(Boolean).length, 29);
    assert.ok(raster.includes("2028-02-29"));
  });
});

describe("beschreibeOeffnungszeiten", () => {
  it("listet die Wochentage in verständlicher Form", () => {
    const bild = beschreibeOeffnungszeiten(REGELN);
    assert.equal(bild.wochentage[0].label, "Montag");
    assert.equal(bild.wochentage[0].zeit, "07:30–17:00 Uhr");
    assert.equal(bild.wochentage.at(-1)?.zeit, "geschlossen");
  });

  it("listet Ausnahmen mit Datum und Notiz", () => {
    const bild = beschreibeOeffnungszeiten(REGELN);
    assert.equal(bild.ausnahmen.length, 1);
    assert.equal(bild.ausnahmen[0].label, "14.10.2026");
    assert.equal(bild.ausnahmen[0].hinweis, "Betriebsferien");
  });
});
