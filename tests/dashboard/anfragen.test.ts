/**
 * Tests der Dashboard-Logik (Baustein 3, Teil A): Statusübergänge,
 * Termin-Kollisionsprüfung, Filter/Sortierung/Kennzahlen und die
 * Anzeige-Aufbereitung der Inbox und Detailansicht.
 *
 * Geprüft wird ausschließlich `src/lib/dashboard/anfragen.ts` — reine
 * Funktionen, keine Datenbank. Die Datenbank prüft dieselben Übergänge noch
 * einmal selbst (scripts/rls-check.sh, Abschnitt 7).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AKTION_BESCHRIFTUNG,
  AKTION_ZIELSTATUS,
  ERLAUBTE_UEBERGAENGE,
  MINUTEN_MAX,
  MINUTEN_MIN,
  STATUS_FILTER,
  STATUS_HINWEIS,
  berechneKennzahlen,
  beschreibeEingang,
  beschreibeKontaktart,
  beschreibeQuelle,
  filtereAnfragen,
  formatierePreisspanne,
  formatiereTag,
  formatiereWunschtermin,
  istIsoDatum,
  lokaleTeile,
  minutenZuUhrzeit,
  normalisiereAnfrageStatus,
  normalisiereSortierung,
  normalisiereStatusFilter,
  pruefeTerminEingabe,
  pruefeUebergang,
  sortiereAnfragen,
  termineAmTag,
  uhrzeitZuMinuten,
  verfuegbareAktionen,
  type AnfrageStatus,
} from "../../src/lib/dashboard/anfragen.ts";
import { STATUS_BESCHRIFTUNG } from "../../src/types/database.ts";

const ALLE_STATUS: AnfrageStatus[] = [
  "neu",
  "bestaetigt",
  "abgelehnt",
  "abgeschlossen",
  "storniert",
];

/* -------------------------------------------------------------------------- */
/* Statusübergänge                                                            */
/* -------------------------------------------------------------------------- */

describe("Statusübergänge", () => {
  it("erlaubt aus „neu“ genau bestätigen, ablehnen oder stornieren", () => {
    assert.deepEqual(verfuegbareAktionen("neu"), ["bestaetigen", "ablehnen", "stornieren"]);
  });

  it("erlaubt aus „bestätigt“ nur abschließen oder stornieren", () => {
    assert.deepEqual(verfuegbareAktionen("bestaetigt"), ["abschliessen", "stornieren"]);
  });

  it("bietet bei entschiedenen Anfragen keine Aktion mehr an", () => {
    for (const status of ["abgelehnt", "abgeschlossen", "storniert"] as const) {
      assert.deepEqual(verfuegbareAktionen(status), [], `Status ${status}`);
    }
  });

  it("erlaubt die fachlich richtigen Übergänge", () => {
    const erlaubt: [AnfrageStatus, AnfrageStatus][] = [
      ["neu", "bestaetigt"],
      ["neu", "abgelehnt"],
      ["neu", "storniert"],
      ["bestaetigt", "abgeschlossen"],
      ["bestaetigt", "storniert"],
    ];
    for (const [von, nach] of erlaubt) {
      const ergebnis = pruefeUebergang(von, nach);
      assert.equal(ergebnis.erlaubt, true, `${von} -> ${nach}`);
      assert.equal(ergebnis.meldung, null, `${von} -> ${nach}`);
    }
  });

  it("verweigert jeden Übergang aus einem Endzustand", () => {
    for (const von of ["abgelehnt", "abgeschlossen", "storniert"] as const) {
      for (const nach of ALLE_STATUS) {
        const ergebnis = pruefeUebergang(von, nach);
        assert.equal(ergebnis.erlaubt, false, `${von} -> ${nach}`);
        assert.ok(ergebnis.meldung, `${von} -> ${nach} braucht eine Meldung`);
      }
    }
  });

  it("verweigert das Überspringen der Entscheidung (neu -> abgeschlossen)", () => {
    const ergebnis = pruefeUebergang("neu", "abgeschlossen");
    assert.equal(ergebnis.erlaubt, false);
    assert.match(ergebnis.meldung ?? "", /nicht auf/);
    assert.match(ergebnis.meldung ?? "", /Neu/);
    assert.match(ergebnis.meldung ?? "", /Abgeschlossen/);
  });

  it("verweigert das Ablehnen einer bereits bestätigten Anfrage", () => {
    const ergebnis = pruefeUebergang("bestaetigt", "abgelehnt");
    assert.equal(ergebnis.erlaubt, false);
    assert.match(ergebnis.meldung ?? "", /Bestätigt/);
    assert.match(ergebnis.meldung ?? "", /Abgelehnt/);
  });

  it("meldet einen Übergang auf denselben Status als „nichts zu ändern“", () => {
    for (const status of ALLE_STATUS) {
      const ergebnis = pruefeUebergang(status, status);
      assert.equal(ergebnis.erlaubt, false, status);
      assert.match(ergebnis.meldung ?? "", /bereits/);
      assert.match(ergebnis.meldung ?? "", new RegExp(STATUS_BESCHRIFTUNG[status]));
    }
  });

  it("liefert bei jeder Verweigerung eine deutsche Meldung statt stiller Änderung", () => {
    for (const von of ALLE_STATUS) {
      for (const nach of ALLE_STATUS) {
        const erlaubt = ERLAUBTE_UEBERGAENGE[von].includes(nach);
        const ergebnis = pruefeUebergang(von, nach);
        assert.equal(ergebnis.erlaubt, erlaubt, `${von} -> ${nach}`);
        if (!erlaubt) {
          assert.ok(
            (ergebnis.meldung ?? "").length > 20,
            `${von} -> ${nach} braucht eine ausführliche Meldung`,
          );
          assert.match(ergebnis.meldung ?? "", /Anfrage/, `${von} -> ${nach}`);
        }
      }
    }
  });

  it("behandelt unbekannte Statuswerte wie „neu“", () => {
    assert.equal(normalisiereAnfrageStatus("BESTAETIGT"), "bestaetigt");
    assert.equal(normalisiereAnfrageStatus(" abgelehnt "), "abgelehnt");
    assert.equal(normalisiereAnfrageStatus("quatsch"), "neu");
    assert.equal(normalisiereAnfrageStatus(null), "neu");
    assert.equal(normalisiereAnfrageStatus(42), "neu");
    assert.equal(pruefeUebergang(undefined, "abgelehnt").erlaubt, true);
  });

  it("hält Aktionsnamen, Zielstatus und Übergangstabelle konsistent", () => {
    for (const [aktion, ziel] of Object.entries(AKTION_ZIELSTATUS)) {
      assert.ok(AKTION_BESCHRIFTUNG[aktion as keyof typeof AKTION_BESCHRIFTUNG]);
      const quellen = ALLE_STATUS.filter((von) => ERLAUBTE_UEBERGAENGE[von].includes(ziel));
      assert.ok(quellen.length > 0, `Zielstatus ${ziel} ist von nirgends erreichbar`);
      // Genau die Status, von denen aus der Zielstatus erlaubt ist, müssen die
      // Aktion anbieten — und kein anderer.
      for (const von of ALLE_STATUS) {
        const angeboten = verfuegbareAktionen(von).includes(
          aktion as keyof typeof AKTION_ZIELSTATUS,
        );
        assert.equal(angeboten, quellen.includes(von), `${von} -> ${aktion}`);
      }
    }
  });

  it("hat zu jedem Status einen Hinweistext", () => {
    for (const status of ALLE_STATUS) {
      assert.ok(STATUS_HINWEIS[status].length > 20, status);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Termin-Kollisionsprüfung                                                   */
/* -------------------------------------------------------------------------- */

/** Termin aus Wanduhr-Zeit in Europe/Berlin (Sommerzeit = UTC+2). */
function berlinerTermin(
  datum: string,
  von: string,
  bis: string,
  status = "bestaetigt",
  title: string | null = null,
) {
  const zuUtc = (uhrzeit: string) => `${datum}T${uhrzeit}:00+02:00`;
  return {
    starts_at: zuUtc(von),
    ends_at: zuUtc(bis),
    status,
    title,
  };
}

describe("Terminprüfung", () => {
  const zeitzone = "Europe/Berlin";
  const vorhandeneTermine = [
    berlinerTermin("2026-06-10", "09:00", "10:00", "bestaetigt", "Reifenwechsel (Golf 7)"),
  ];

  it("erkennt eine echte Überschneidung", () => {
    const ergebnis = pruefeTerminEingabe({
      datum: "2026-06-10",
      uhrzeit: "09:30",
      dauerMinuten: 60,
      termine: vorhandeneTermine,
      zeitzone,
    });
    assert.equal(ergebnis.ok, false);
    assert.match(ergebnis.meldung, /bereits ein Termin eingetragen/);
    assert.match(ergebnis.meldung, /09:00–10:00/);
    assert.match(ergebnis.meldung, /Reifenwechsel \(Golf 7\)/);
  });

  it("erkennt einen Termin, der einen bestehenden vollständig umschließt", () => {
    const ergebnis = pruefeTerminEingabe({
      datum: "2026-06-10",
      uhrzeit: "08:30",
      dauerMinuten: 120, // 08:30–10:30 umschließt 09:00–10:00
      termine: vorhandeneTermine,
      zeitzone,
    });
    assert.equal(ergebnis.ok, false);
    assert.match(ergebnis.meldung, /bereits ein Termin/);
  });

  it("lässt einen direkt anschließenden Termin zu (Ende = Start)", () => {
    const ergebnis = pruefeTerminEingabe({
      datum: "2026-06-10",
      uhrzeit: "10:00",
      dauerMinuten: 60,
      termine: vorhandeneTermine,
      zeitzone,
    });
    assert.deepEqual(ergebnis, { ok: true });
  });

  it("lässt einen Termin vor dem bestehenden zu (Ende = Start)", () => {
    const ergebnis = pruefeTerminEingabe({
      datum: "2026-06-10",
      uhrzeit: "08:30",
      dauerMinuten: 30,
      termine: vorhandeneTermine,
      zeitzone,
    });
    assert.deepEqual(ergebnis, { ok: true });
  });

  it("ignoriert Termine an anderen Tagen und abgesagte Termine", () => {
    const andere = [
      berlinerTermin("2026-06-11", "09:00", "10:00", "bestaetigt"),
      berlinerTermin("2026-06-10", "09:00", "10:00", "abgesagt"),
    ];
    const ergebnis = pruefeTerminEingabe({
      datum: "2026-06-10",
      uhrzeit: "09:30",
      dauerMinuten: 60,
      termine: andere,
      zeitzone,
    });
    assert.deepEqual(ergebnis, { ok: true });
  });

  it("prüft Kollisionen in der Zeitzone der Werkstatt, nicht in UTC", () => {
    // 07:00 UTC ist 09:00 in Berlin — der Slot muss in der Wanduhr kollidieren.
    const termin = { starts_at: "2026-06-10T07:00:00Z", ends_at: "2026-06-10T08:00:00Z" };
    const ergebnis = pruefeTerminEingabe({
      datum: "2026-06-10",
      uhrzeit: "09:15",
      dauerMinuten: 30,
      termine: [termin],
      zeitzone,
    });
    assert.equal(ergebnis.ok, false);
    assert.match(ergebnis.meldung, /09:00–10:00/);
  });

  it("erkennt eine Kollision auch bei einem anderen Werkstatt-Zeitzonenwert", () => {
    const termin = { starts_at: "2026-06-10T07:00:00Z", ends_at: "2026-06-10T08:00:00Z" };
    const ergebnis = pruefeTerminEingabe({
      datum: "2026-06-10",
      uhrzeit: "07:30",
      dauerMinuten: 30,
      termine: [termin],
      zeitzone: "UTC",
    });
    assert.equal(ergebnis.ok, false, "in UTC liegt der Termin um 07:00");
  });

  it("verlangt ein Datum", () => {
    const ergebnis = pruefeTerminEingabe({
      datum: "",
      uhrzeit: "09:00",
      dauerMinuten: 60,
      termine: [],
      zeitzone,
    });
    assert.equal(ergebnis.ok, false);
    assert.match(ergebnis.meldung, /Datum/);
  });

  it("verlangt eine Uhrzeit im Format HH:MM", () => {
    for (const uhrzeit of ["", "9 Uhr", "25:00", "09:75", null]) {
      const ergebnis = pruefeTerminEingabe({
        datum: "2026-06-10",
        uhrzeit,
        dauerMinuten: 60,
        termine: [],
        zeitzone,
      });
      assert.equal(ergebnis.ok, false, String(uhrzeit));
      assert.match(ergebnis.meldung, /HH:MM/);
    }
  });

  it("begrenzt die Dauer auf 15 bis 480 Minuten", () => {
    for (const dauer of [MINUTEN_MIN - 1, MINUTEN_MAX + 1, Number.NaN]) {
      const ergebnis = pruefeTerminEingabe({
        datum: "2026-06-10",
        uhrzeit: "09:00",
        dauerMinuten: dauer,
        termine: [],
        zeitzone,
      });
      assert.equal(ergebnis.ok, false, String(dauer));
      assert.match(ergebnis.meldung, /zwischen 15 und 480 Minuten/);
    }
    for (const dauer of [MINUTEN_MIN, MINUTEN_MAX]) {
      const ergebnis = pruefeTerminEingabe({
        datum: "2026-06-10",
        uhrzeit: "09:00",
        dauerMinuten: dauer,
        termine: [],
        zeitzone,
      });
      assert.deepEqual(ergebnis, { ok: true }, String(dauer));
    }
  });

  it("lehnt einen Termin über Mitternacht hinaus ab", () => {
    const ergebnis = pruefeTerminEingabe({
      datum: "2026-06-10",
      uhrzeit: "23:30",
      dauerMinuten: 60,
      termine: [],
      zeitzone,
    });
    assert.equal(ergebnis.ok, false);
    assert.match(ergebnis.meldung, /Mitternacht/);
  });

  it("lehnt ein Datum in der Vergangenheit ab, akzeptiert aber heute", () => {
    const gestern = pruefeTerminEingabe({
      datum: "2026-06-09",
      uhrzeit: "09:00",
      dauerMinuten: 60,
      termine: [],
      zeitzone,
      heute: "2026-06-10",
    });
    assert.equal(gestern.ok, false);
    assert.match(gestern.meldung, /Vergangenheit/);

    const heute = pruefeTerminEingabe({
      datum: "2026-06-10",
      uhrzeit: "09:00",
      dauerMinuten: 60,
      termine: [],
      zeitzone,
      heute: "2026-06-10",
    });
    assert.deepEqual(heute, { ok: true });
  });

  it("nimmt alle drei kollisionsrelevanten Terminstatus ernst", () => {
    for (const status of ["geplant", "bestaetigt", "abgeschlossen"]) {
      const ergebnis = pruefeTerminEingabe({
        datum: "2026-06-10",
        uhrzeit: "09:30",
        dauerMinuten: 30,
        termine: [berlinerTermin("2026-06-10", "09:00", "10:00", status)],
        zeitzone,
      });
      assert.equal(ergebnis.ok, false, status);
    }
    for (const status of ["abgesagt", "nicht_erschienen"]) {
      const ergebnis = pruefeTerminEingabe({
        datum: "2026-06-10",
        uhrzeit: "09:30",
        dauerMinuten: 30,
        termine: [berlinerTermin("2026-06-10", "09:00", "10:00", status)],
        zeitzone,
      });
      assert.deepEqual(ergebnis, { ok: true }, status);
    }
  });
});

describe("Zeit-Hilfsfunktionen", () => {
  it("rechnet Uhrzeiten in Minuten um und zurück", () => {
    assert.equal(uhrzeitZuMinuten("09:30"), 570);
    assert.equal(uhrzeitZuMinuten(" 9:05 "), 545);
    assert.equal(uhrzeitZuMinuten("00:00"), 0);
    assert.equal(uhrzeitZuMinuten("23:59"), 1439);
    for (const ungueltig of ["24:00", "12:60", "12", "", "abc", null, undefined]) {
      assert.equal(uhrzeitZuMinuten(ungueltig), null, String(ungueltig));
    }
    assert.equal(minutenZuUhrzeit(570), "09:30");
    assert.equal(minutenZuUhrzeit(0), "00:00");
    assert.equal(minutenZuUhrzeit(1439), "23:59");
    assert.equal(minutenZuUhrzeit(1440), "23:59", "wird auf den Tag begrenzt");
  });

  it("prüft Datumsangaben streng auf YYYY-MM-DD", () => {
    assert.equal(istIsoDatum("2026-06-10"), true);
    assert.equal(istIsoDatum("2026-02-30"), false);
    assert.equal(istIsoDatum("10.06.2026"), false);
    assert.equal(istIsoDatum("2026-6-10"), false);
    assert.equal(istIsoDatum(null), false);
    assert.equal(istIsoDatum(20260610), false);
  });

  it("ermittelt die Wanduhrzeit in der Werkstatt-Zeitzone", () => {
    assert.deepEqual(lokaleTeile("2026-06-10T07:00:00Z", "Europe/Berlin"), {
      datum: "2026-06-10",
      minute: 540,
    });
    assert.deepEqual(lokaleTeile("2026-01-10T07:00:00Z", "Europe/Berlin"), {
      datum: "2026-01-10",
      minute: 480,
    });
    assert.equal(lokaleTeile("kein-datum", "Europe/Berlin"), null);
    assert.equal(lokaleTeile(null, "Europe/Berlin"), null);
    // Unbekannte Zeitzone fällt auf Europe/Berlin zurück, statt zu werfen.
    assert.deepEqual(lokaleTeile("2026-06-10T07:00:00Z", "Gibts/Nicht"), {
      datum: "2026-06-10",
      minute: 540,
    });
  });

  it("sammelt die Termine eines Tages, sortiert und ohne Fremdstatus", () => {
    const termine = [
      berlinerTermin("2026-06-10", "14:00", "15:00", "geplant", "Annahme"),
      berlinerTermin("2026-06-10", "08:00", "09:00", "bestaetigt"),
      berlinerTermin("2026-06-11", "08:00", "09:00", "bestaetigt"),
      berlinerTermin("2026-06-10", "10:00", "11:00", "abgesagt"),
    ];
    const tag = termineAmTag(termine, "2026-06-10", "Europe/Berlin");
    assert.deepEqual(tag, [
      { startMinute: 480, endMinute: 540, title: null },
      { startMinute: 840, endMinute: 900, title: "Annahme" },
    ]);
  });

  it("zählt einen über Mitternacht laufenden Termin bis Tagesende", () => {
    const termin = {
      starts_at: "2026-06-10T20:00:00Z", // 22:00 Berlin
      ends_at: "2026-06-11T02:00:00Z", // 04:00 Berlin (Folgetag)
      status: "bestaetigt",
    };
    assert.deepEqual(termineAmTag([termin], "2026-06-10", "Europe/Berlin"), [
      { startMinute: 1320, endMinute: 1440, title: null },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Filter, Sortierung, Kennzahlen                                             */
/* -------------------------------------------------------------------------- */

function anfrage(status: AnfrageStatus, created_at: string, id = created_at) {
  return { id, status, created_at };
}

const BESTAND = [
  anfrage("neu", "2026-06-01T08:00:00Z", "a"),
  anfrage("bestaetigt", "2026-06-03T08:00:00Z", "b"),
  anfrage("neu", "2026-06-02T08:00:00Z", "c"),
  anfrage("abgelehnt", "2026-06-04T08:00:00Z", "d"),
  anfrage("abgeschlossen", "2026-06-05T08:00:00Z", "e"),
  anfrage("storniert", "2026-06-06T08:00:00Z", "f"),
];

describe("Filter und Sortierung der Inbox", () => {
  it("kennt genau die Filter der Oberfläche", () => {
    assert.deepEqual(
      STATUS_FILTER.map((eintrag) => eintrag.wert),
      ["alle", ...ALLE_STATUS],
    );
    for (const eintrag of STATUS_FILTER) {
      assert.ok(eintrag.label.length > 0, eintrag.wert);
    }
  });

  it("filtert nach Status", () => {
    assert.equal(filtereAnfragen(BESTAND, "alle").length, 6);
    assert.deepEqual(
      filtereAnfragen(BESTAND, "neu").map((eintrag) => eintrag.id),
      ["a", "c"],
    );
    assert.equal(filtereAnfragen(BESTAND, "bestaetigt").length, 1);
    assert.deepEqual(filtereAnfragen([], "neu"), []);
  });

  it("verändert die Eingabeliste beim Filtern nicht", () => {
    const eingabe = [...BESTAND];
    filtereAnfragen(eingabe, "neu");
    assert.equal(eingabe.length, 6);
    assert.notEqual(filtereAnfragen(BESTAND, "alle"), BESTAND, "neue Liste, nicht dieselbe");
  });

  it("sortiert nach Eingang — neueste zuerst ist die Vorgabe", () => {
    assert.deepEqual(
      sortiereAnfragen(BESTAND).map((eintrag) => eintrag.id),
      ["f", "e", "d", "b", "c", "a"],
    );
    assert.deepEqual(
      sortiereAnfragen(BESTAND, "aelteste").map((eintrag) => eintrag.id),
      ["a", "c", "b", "d", "e", "f"],
    );
  });

  it("lässt die Eingabeliste beim Sortieren unverändert", () => {
    const eingabe = [...BESTAND];
    sortiereAnfragen(eingabe, "aelteste");
    assert.deepEqual(
      eingabe.map((eintrag) => eintrag.id),
      ["a", "b", "c", "d", "e", "f"],
    );
  });

  it("sortiert und filtert in der Reihenfolge der Oberfläche zusammen", () => {
    assert.deepEqual(
      sortiereAnfragen(filtereAnfragen(BESTAND, "neu"), "aelteste").map((e) => e.id),
      ["a", "c"],
    );
  });

  it("fällt bei unbekannten Adresszeilen-Werten auf den Standard zurück", () => {
    assert.equal(normalisiereStatusFilter("NEU"), "neu");
    assert.equal(normalisiereStatusFilter(" alle "), "alle");
    assert.equal(normalisiereStatusFilter("geloescht"), "alle");
    assert.equal(normalisiereStatusFilter(null), "alle");
    assert.equal(normalisiereSortierung("Aelteste"), "aelteste");
    assert.equal(normalisiereSortierung("unsinn"), "neueste");
    assert.equal(normalisiereSortierung(undefined), "neueste");
  });
});

describe("Kennzahlen der Übersicht", () => {
  it("zählt jede Statusgruppe und die Gesamtzahl", () => {
    assert.deepEqual(berechneKennzahlen(BESTAND), {
      gesamt: 6,
      offen: 2,
      bestaetigt: 1,
      abgelehnt: 1,
      abgeschlossen: 1,
      storniert: 1,
    });
  });

  it("liefert bei leerer Liste überall null", () => {
    assert.deepEqual(berechneKennzahlen([]), {
      gesamt: 0,
      offen: 0,
      bestaetigt: 0,
      abgelehnt: 0,
      abgeschlossen: 0,
      storniert: 0,
    });
  });

  it("summiert die Einzelwerte immer zur Gesamtzahl", () => {
    const kennzahlen = berechneKennzahlen(BESTAND);
    const summe =
      kennzahlen.offen +
      kennzahlen.bestaetigt +
      kennzahlen.abgelehnt +
      kennzahlen.abgeschlossen +
      kennzahlen.storniert;
    assert.equal(summe, kennzahlen.gesamt);
  });

  it("zählt dieselben Zahlen, die der jeweilige Filter anzeigt", () => {
    const kennzahlen = berechneKennzahlen(BESTAND);
    assert.equal(filtereAnfragen(BESTAND, "neu").length, kennzahlen.offen);
    assert.equal(filtereAnfragen(BESTAND, "bestaetigt").length, kennzahlen.bestaetigt);
    assert.equal(filtereAnfragen(BESTAND, "alle").length, kennzahlen.gesamt);
  });

  it("verändert die Eingabeliste nicht", () => {
    const eingabe = [...BESTAND];
    berechneKennzahlen(eingabe);
    assert.equal(eingabe.length, 6);
  });
});

/* -------------------------------------------------------------------------- */
/* Anzeige-Aufbereitung                                                       */
/* -------------------------------------------------------------------------- */

describe("Anzeige-Aufbereitung", () => {
  it("übersetzt Statuswerte in deutsche Bezeichnungen", () => {
    assert.equal(STATUS_BESCHRIFTUNG.neu, "Neu");
    assert.equal(STATUS_BESCHRIFTUNG.bestaetigt, "Bestätigt");
    assert.equal(STATUS_BESCHRIFTUNG.abgelehnt, "Abgelehnt");
    assert.equal(STATUS_BESCHRIFTUNG.abgeschlossen, "Abgeschlossen");
    assert.equal(STATUS_BESCHRIFTUNG.storniert, "Storniert");
  });

  it("übersetzt Kontaktart und Quelle, mit Rückfall", () => {
    assert.equal(beschreibeKontaktart("email"), "E-Mail");
    assert.equal(beschreibeKontaktart(" TELEFON "), "Telefonanruf");
    assert.equal(beschreibeKontaktart("sms"), "SMS");
    assert.equal(beschreibeKontaktart("brieftaube"), "Keine Angabe");
    assert.equal(beschreibeKontaktart(null), "Keine Angabe");
    assert.equal(beschreibeQuelle("online"), "Online-Formular (Kundenportal)");
    assert.equal(beschreibeQuelle("sms_webhook"), "Telefonanruf mit SMS-Link");
    assert.equal(beschreibeQuelle("unbekannt"), "Unbekannter Weg");
  });

  it("formatiert Tage deutsch", () => {
    assert.equal(formatiereTag("2026-06-05"), "05.06.2026");
    assert.equal(formatiereTag(""), "—");
    assert.equal(formatiereTag(null), "—");
    assert.equal(formatiereTag(undefined), "—");
  });

  it("beschreibt den Wunschtermin in einem Satz", () => {
    assert.equal(formatiereWunschtermin("2026-06-05", "2026-06-12"), "05.06.2026 – 12.06.2026");
    assert.equal(formatiereWunschtermin("2026-06-05", "2026-06-05"), "05.06.2026");
    assert.equal(formatiereWunschtermin("2026-06-05", null), "05.06.2026");
    assert.equal(
      formatiereWunschtermin("2026-06-05", "2026-06-12", "am liebsten morgens"),
      "05.06.2026 – 12.06.2026 · am liebsten morgens",
    );
    assert.equal(
      formatiereWunschtermin(null, null, "  "),
      "Kein Wunschtermin angegeben",
    );
  });

  it("formatiert die Preisspanne in Euro", () => {
    assert.equal(formatierePreisspanne(289, 420), "289,00 € – 420,00 €");
    assert.equal(formatierePreisspanne("289.5", "289.5"), "289,50 €");
    assert.equal(formatierePreisspanne(null, 420), "bis 420,00 €");
    assert.equal(formatierePreisspanne(150, null), "150,00 €");
    assert.equal(formatierePreisspanne(null, null), "Keine Schätzung vorhanden");
    assert.equal(formatierePreisspanne("", ""), "Keine Schätzung vorhanden");
  });

  it("beschreibt den Eingang in Worten, bezogen auf einen festen Zeitpunkt", () => {
    const jetzt = new Date("2026-06-10T12:00:00Z");
    const vor = (ms: number) => new Date(jetzt.getTime() - ms).toISOString();
    assert.equal(beschreibeEingang(vor(10_000), jetzt), "gerade eben");
    assert.equal(beschreibeEingang(vor(60_000), jetzt), "vor 1 Minute");
    assert.equal(beschreibeEingang(vor(5 * 60_000), jetzt), "vor 5 Minuten");
    assert.equal(beschreibeEingang(vor(3_600_000), jetzt), "vor 1 Stunde");
    assert.equal(beschreibeEingang(vor(4 * 3_600_000), jetzt), "vor 4 Stunden");
    assert.equal(beschreibeEingang(vor(26 * 3_600_000), jetzt), "vor 1 Tag");
    assert.equal(beschreibeEingang(vor(3 * 24 * 3_600_000), jetzt), "vor 3 Tagen");
    assert.equal(beschreibeEingang(vor(45 * 24 * 3_600_000), jetzt), "vor 1 Monat");
    assert.equal(beschreibeEingang(vor(70 * 24 * 3_600_000), jetzt), "vor 2 Monaten");
    assert.equal(beschreibeEingang(null, jetzt), "Zeitpunkt unbekannt");
    assert.equal(beschreibeEingang("kein-datum", jetzt), "Zeitpunkt unbekannt");
  });
});
