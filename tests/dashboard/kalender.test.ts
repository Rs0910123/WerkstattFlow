/**
 * Tests der Kalenderlogik des Werkstatt-Dashboards
 * (src/lib/dashboard/kalender.ts, Baustein 3 / Teil B1b).
 *
 * Geprüft wird reine Rechenlogik ohne Datenbank und ohne DOM: Monatsraster,
 * Monats-/Jahreswechsel, die Zuordnung von Terminen und offenen Anfragen zum
 * richtigen Tag sowie die Zeitzonen- und Sommerzeit-Grenzfälle.
 *
 * WO DIE ERWARTUNGEN HERKOMMEN
 * Nichts hier ist geraten. Die konkreten Zeitpunkte folgen der Zeitzonen-
 * datenbank für Europe/Berlin, die die Laufzeit über `Intl` mitbringt:
 *   * Sommerzeit (CEST) = UTC+2, Winterzeit (CET) = UTC+1.
 *   * Umstellung 2026: vorwärts am Sonntag, 29.03.2026 (01:00 UTC → 02:00 wird
 *     zu 03:00 Ortszeit, die Stunde 02:00–02:59 existiert nicht), zurück am
 *     Sonntag, 25.10.2026 (01:00 UTC → 03:00 wird zu 02:00, die Stunde
 *     02:00–02:59 kommt zweimal vor).
 * Die Kommentare an den einzelnen Tests halten fest, was gemessen wurde, damit
 * ein späterer Fehlschlag sofort zeigt, ob Code oder Erwartung falsch ist.
 *
 * Bewusst als Eigenschaftsprüfung formuliert ist das Monatsraster (erster
 * Wochentag, Anzahl Zellen): dort wird gegen `wochentagIso`/`monatsTage`
 * gerechnet, nicht gegen abgeschriebene Zahlen. Die festen Anker (z. B. dass
 * der 01.10.2026 ein Donnerstag ist) stehen zusätzlich als eigene Prüfung da.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  anfragenAmTag,
  anfragenImZeitraum,
  anfragenOhneZeitraum,
  berechneKalenderKennzahlen,
  heuteInZeitzone,
  istMonatParam,
  istOffen,
  istWunschtag,
  monatAusTag,
  monatPlus,
  monatsGrenzen,
  monatsTage,
  monatsZellen,
  naechsterTagMitTermin,
  normalisiereMonat,
  normalisiereTag,
  ordneTermineTagen,
  termineAmTag,
  wochenTage,
  wochenVersatz,
  zerlegeZeitraum,
  type KalenderAnfrage,
  type KalenderTermin,
  type TerminImTag,
} from "../../src/lib/dashboard/kalender.ts";
import { wochentagIso } from "../../src/lib/portal/format.ts";

const BERLIN = "Europe/Berlin";

function termin(
  id: string,
  startsAt: string,
  endsAt: string,
  extras: Partial<KalenderTermin> = {},
): KalenderTermin {
  return {
    id,
    titel: extras.titel ?? `Termin ${id}`,
    startsAt,
    endsAt,
    status: extras.status ?? "bestaetigt",
    bay: extras.bay ?? null,
    kunde: extras.kunde ?? null,
    fahrzeug: extras.fahrzeug ?? null,
    leistung: extras.leistung ?? null,
    referenz: extras.referenz ?? null,
    anfrageId: extras.anfrageId ?? null,
  };
}

function anfrage(
  id: string,
  extras: Partial<KalenderAnfrage> = {},
): KalenderAnfrage {
  return {
    id,
    reference: extras.reference ?? `ANF-${id}`,
    serviceType: extras.serviceType ?? "Inspektion",
    status: extras.status ?? "neu",
    wunschVon: extras.wunschVon ?? null,
    wunschBis: extras.wunschBis ?? null,
    zeitHinweis: extras.zeitHinweis ?? null,
    kunde: extras.kunde ?? null,
    fahrzeug: extras.fahrzeug ?? null,
    preisHinweis: extras.preisHinweis ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Monat, Raster, Navigation                                                  */
/* -------------------------------------------------------------------------- */

describe("Monatsarithmetik", () => {
  it("verschiebt über den Jahreswechsel in beide Richtungen", () => {
    assert.equal(monatPlus("2026-12", 1), "2027-01");
    assert.equal(monatPlus("2026-01", -1), "2025-12");
    assert.equal(monatPlus("2026-10", 0), "2026-10");
    // 12 Schritte = genau ein Jahr, auch rückwärts über mehrere Jahre.
    assert.equal(monatPlus("2026-10", 12), "2027-10");
    assert.equal(monatPlus("2026-01", -13), "2024-12");
    assert.equal(monatPlus("2026-10", 3), "2027-01");
    assert.equal(monatPlus("2026-10", -10), "2025-12");
  });

  it("prüft Monatsangaben und lehnt Unsinn ab", () => {
    assert.equal(istMonatParam("2026-10"), true);
    assert.equal(istMonatParam("2026-13"), false);
    assert.equal(istMonatParam("2026-00"), false);
    assert.equal(istMonatParam("2026-1"), false);
    assert.equal(istMonatParam(202610), false);
    assert.equal(istMonatParam(undefined), false);
  });

  it("liefert Tage und Grenzen eines Monats (inkl. Schaltjahr)", () => {
    assert.equal(monatsTage("2026-10").length, 31);
    assert.equal(monatsTage("2026-11").length, 30);
    // 2026 ist kein Schaltjahr, 2024 und 2000 sind es (Regel: durch 4, nicht
    // durch 100 — außer durch 400).
    assert.equal(monatsTage("2026-02").length, 28);
    assert.equal(monatsTage("2024-02").length, 29);
    assert.equal(monatsTage("2100-02").length, 28);
    assert.equal(monatsTage("2000-02").length, 29);

    assert.deepEqual(monatsGrenzen("2026-10"), { von: "2026-10-01", bis: "2026-10-31" });
    assert.deepEqual(monatsGrenzen("2024-02"), { von: "2024-02-01", bis: "2024-02-29" });
    assert.equal(monatAusTag("2026-10-06"), "2026-10");
  });

  it("normalisiert Monats- und Tagesparameter aus der Adresszeile", () => {
    assert.equal(normalisiereMonat("2026-11", "2026-10-06"), "2026-11");
    assert.equal(normalisiereMonat("2026-13", "2026-10-06"), "2026-10");
    assert.equal(normalisiereMonat(null, "2026-10-06"), "2026-10");

    assert.equal(normalisiereTag("2026-10-06"), "2026-10-06");
    assert.equal(normalisiereTag("2026-02-30"), null);
    assert.equal(normalisiereTag("2026-10-6"), null);
    assert.equal(normalisiereTag(""), null);
    assert.equal(normalisiereTag(42), null);
  });
});

describe("Monatsraster", () => {
  const monate = [
    "2026-01",
    "2026-02",
    "2026-03",
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
    "2026-12",
    "2024-02",
    "2027-02",
  ];

  it("hat immer 42 Zellen, auch wenn der Monat mit 6 Wochen nicht auskommt", () => {
    for (const monat of monate) {
      const zellen = monatsZellen(monat, new Map(), []);
      assert.equal(zellen.length, 42, `Monat ${monat}`);
    }
  });

  it("beginnt mit so vielen Leerzellen, wie der Monat vor Montag liegt", () => {
    for (const monat of monate) {
      const zellen = monatsZellen(monat, new Map(), []);
      const ersterTag = monatsTage(monat)[0];
      const erwarteteLeerzellen = wochentagIso(ersterTag) - 1;
      const tatsaechlich = zellen.findIndex((zelle) => zelle.tag !== null);
      assert.equal(tatsaechlich, erwarteteLeerzellen, `Monat ${monat}`);
      // Alle Leerzellen stehen am Anfang, nicht in der Mitte.
      assert.equal(zellen.slice(0, tatsaechlich).every((z) => z.tag === null), true);
    }
  });

  it("enthält jeden Tag des Monats genau einmal, in aufsteigender Reihenfolge", () => {
    for (const monat of monate) {
      const tage = monatsZellen(monat, new Map(), [])
        .map((zelle) => zelle.tag)
        .filter((tag): tag is string => tag !== null);
      assert.deepEqual(tage, monatsTage(monat), `Monat ${monat}`);
    }
  });

  it("markiert Tage des angezeigten Monats als imMonat", () => {
    const zellen = monatsZellen("2026-10", new Map(), []);
    for (const zelle of zellen) {
      assert.equal(zelle.imMonat, zelle.tag !== null && zelle.tag.startsWith("2026-10"));
    }
  });

  it("trifft die gemessenen Wochentage der Monatsanfänge 2026", () => {
    // Gemessen mit wochentagIso (ISO: 1 = Montag ... 7 = Sonntag).
    assert.equal(wochentagIso("2026-01-01"), 4); // Donnerstag
    assert.equal(wochentagIso("2026-03-01"), 7); // Sonntag
    assert.equal(wochentagIso("2026-10-01"), 4); // Donnerstag
    assert.equal(wochentagIso("2026-11-01"), 7); // Sonntag

    // Oktober 2026 beginnt donnerstags: drei Leerzellen (Mo, Di, Mi) davor.
    const oktober = monatsZellen("2026-10", new Map(), []);
    assert.equal(oktober[0].tag, null);
    assert.equal(oktober[1].tag, null);
    assert.equal(oktober[2].tag, null);
    assert.equal(oktober[3].tag, "2026-10-01");
    // 31 Tage + 3 Leerzellen = 34 belegte Zellen, der Rest (8) ist leer.
    assert.equal(oktober.filter((zelle) => zelle.tag === null).length, 42 - 31);

    // November 2026 beginnt sonntags: sechs Leerzellen davor.
    const november = monatsZellen("2026-11", new Map(), []);
    assert.equal(november[5].tag, null);
    assert.equal(november[6].tag, "2026-11-01");
  });

  it("trägt Termin- und Anfragezahlen in die richtige Zelle ein", () => {
    const termine = ordneTermineTagen(
      [termin("a", "2026-10-06T06:00:00Z", "2026-10-06T07:00:00Z")],
      BERLIN,
    );
    const zellen = monatsZellen("2026-10", termine, [
      anfrage("1", { wunschVon: "2026-10-06", wunschBis: "2026-10-08" }),
    ]);

    const sechster = zellen.find((zelle) => zelle.tag === "2026-10-06");
    const siebter = zellen.find((zelle) => zelle.tag === "2026-10-07");
    const neunter = zellen.find((zelle) => zelle.tag === "2026-10-09");
    assert.ok(sechster && siebter && neunter);
    assert.equal(sechster.terminAnzahl, 1);
    assert.equal(sechster.anfrageAnzahl, 1);
    assert.equal(sechster.terminTitel.length, 1);
    // Der Wunschzeitraum reicht bis zum 08.10.
    assert.equal(siebter.anfrageAnzahl, 1);
    assert.equal(neunter.anfrageAnzahl, 0);
    assert.equal(neunter.terminAnzahl, 0);
  });
});

describe("Wochen und Navigation", () => {
  it("liefert Montag bis Sonntag der Woche um den Tag", () => {
    // 06.10.2026 ist ein Dienstag → Woche 05.10. (Mo) bis 11.10. (So).
    assert.deepEqual(wochenTage("2026-10-06"), [
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
    ]);
    // Sonntag gehört zur Woche davor (ISO-Woche), nicht zur folgenden.
    assert.equal(wochenTage("2026-10-11")[0], "2026-10-05");
    // Montag ist der erste Tag seiner eigenen Woche.
    assert.equal(wochenTage("2026-10-05")[0], "2026-10-05");
    // Jahreswechsel: 01.01.2026 ist ein Donnerstag → Woche ab 29.12.2025.
    assert.deepEqual(wochenTage("2026-01-01"), [
      "2025-12-29",
      "2025-12-30",
      "2025-12-31",
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
    ]);
  });

  it("verschiebt um ganze Wochen über Monats- und Jahresgrenzen", () => {
    assert.equal(wochenVersatz("2026-10-06", 1), "2026-10-13");
    assert.equal(wochenVersatz("2026-10-06", -1), "2026-09-29");
    assert.equal(wochenVersatz("2026-12-29", 1), "2027-01-05");
  });

  it("findet den nächsten Tag mit Termin in beide Richtungen", () => {
    const tage = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"];
    const karte = new Map<string, TerminImTag[]>([
      ["2026-10-06", [{ } as unknown as TerminImTag]],
      ["2026-10-08", [{} as unknown as TerminImTag, {} as unknown as TerminImTag]],
    ]);
    assert.equal(naechsterTagMitTermin(tage, karte, 1), "2026-10-06");
    assert.equal(naechsterTagMitTermin(tage, karte, -1), "2026-10-08");
    assert.equal(naechsterTagMitTermin(["2026-10-05"], new Map(), 1), null);
  });
});

/* -------------------------------------------------------------------------- */
/* Abfragezeitraum                                                            */
/* -------------------------------------------------------------------------- */

describe("Abfragezeitraum", () => {
  it("erweitert den Monat um je einen Tag in UTC", () => {
    // Absicht der Funktion: die Datenbank liefert Zeitstempel in UTC, die
    // Tagesgrenzen gelten aber in Werkstatt-Zeit. Ein Tag Rand deckt jeden
    // Zeitzonenversatz ab, die Ansicht filtert danach exakt.
    assert.deepEqual(zerlegeZeitraum("2026-10-01", "2026-10-31"), {
      vonIso: "2026-09-30T00:00:00.000Z",
      bisIso: "2026-11-01T23:59:59.999Z",
    });
    assert.deepEqual(zerlegeZeitraum("2026-01-01", "2026-01-31"), {
      vonIso: "2025-12-31T00:00:00.000Z",
      bisIso: "2026-02-01T23:59:59.999Z",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* Tageszuordnung und Zeitzonen                                               */
/* -------------------------------------------------------------------------- */

describe("Tageszuordnung von Terminen", () => {
  it("ordnet nach Werkstatt-Zeit zu, nicht nach Serverzeit (UTC)", () => {
    // 06:00 UTC = 08:00 in Berlin (Sommerzeit, UTC+2).
    const karte = ordneTermineTagen(
      [termin("a", "2026-10-06T06:00:00Z", "2026-10-06T07:00:00Z")],
      BERLIN,
    );
    const eintrag = karte.get("2026-10-06")?.[0];
    assert.ok(eintrag);
    assert.equal(eintrag.tag, "2026-10-06");
    assert.equal(eintrag.vonMinute, 8 * 60);
    assert.equal(eintrag.bisMinute, 9 * 60);
    assert.equal(eintrag.uhrzeit, "08:00–09:00 Uhr");
    assert.equal(eintrag.laeuftUeberMitternacht, false);
    // In UTC gerechnet läge derselbe Termin am selben Tag — der Unterschied
    // zeigt sich erst am Abend (nächster Test).
    assert.equal(karte.has("2026-10-07"), false);
  });

  it("legt einen späten Termin auf den Folgetag, wenn dort Mitternacht liegt", () => {
    // 22:30 UTC = 00:30 des Folgetags in Berlin (Sommerzeit).
    const karte = ordneTermineTagen(
      [termin("a", "2026-10-06T22:30:00Z", "2026-10-06T23:30:00Z")],
      BERLIN,
    );
    assert.equal(karte.has("2026-10-06"), false);
    const eintrag = karte.get("2026-10-07")?.[0];
    assert.ok(eintrag);
    assert.equal(eintrag.vonMinute, 30);
    assert.equal(eintrag.uhrzeit, "00:30–01:30 Uhr");
  });

  it("rechnet im Winter mit UTC+1", () => {
    // 15.01.2026, 23:30 UTC = 00:30 des 16.01. in Berlin (Winterzeit, UTC+1).
    const karte = ordneTermineTagen(
      [termin("a", "2026-01-15T23:30:00Z", "2026-01-16T00:30:00Z")],
      BERLIN,
    );
    const eintrag = karte.get("2026-01-16")?.[0];
    assert.ok(eintrag);
    assert.equal(eintrag.vonMinute, 30);
    assert.equal(karte.has("2026-01-15"), false);
  });

  it("markiert Termine, die über Mitternacht laufen", () => {
    // 21:00 UTC = 23:00 Berlin, Ende 23:00 UTC = 01:00 des Folgetags.
    const eintrag = termineAmTag(
      [termin("nacht", "2026-10-06T21:00:00Z", "2026-10-06T23:00:00Z")],
      "2026-10-06",
      BERLIN,
    )[0];
    assert.equal(eintrag.laeuftUeberMitternacht, true);
    assert.equal(eintrag.vonMinute, 23 * 60);
    // Über Mitternacht endet der Termin für die Tagesansicht am Tagesende.
    assert.equal(eintrag.bisMinute, 24 * 60);
    assert.equal(eintrag.uhrzeit, "ab 23:00 Uhr");
  });

  it("sortiert die Termine eines Tages nach Uhrzeit, dann nach Titel", () => {
    const liste = termineAmTag(
      [
        termin("spaet", "2026-10-06T14:00:00Z", "2026-10-06T15:00:00Z", { titel: "Spät" }),
        termin("frueh", "2026-10-06T06:00:00Z", "2026-10-06T07:00:00Z", { titel: "Früh" }),
        termin("mitte", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z", { titel: "Mitte" }),
      ],
      "2026-10-06",
      BERLIN,
    );
    assert.deepEqual(liste.map((e) => e.titel), ["Früh", "Mitte", "Spät"]);
  });

  it("überspringt Termine ohne verwertbaren Zeitstempel", () => {
    const karte = ordneTermineTagen(
      [
        termin("leer", "", ""),
        termin("unsinn", "kein-datum", "kein-datum"),
        termin("gut", "2026-10-06T06:00:00Z", "2026-10-06T07:00:00Z"),
      ],
      BERLIN,
    );
    assert.equal(karte.get("2026-10-06")?.length, 1);
    assert.equal([...karte.values()].flat().length, 1);
  });

  it("fällt bei kaputtem Terminende auf die Startzeit zurück", () => {
    const eintrag = termineAmTag(
      [termin("halb", "2026-10-06T06:00:00Z", "unsinn")],
      "2026-10-06",
      BERLIN,
    )[0];
    assert.equal(eintrag.vonMinute, 8 * 60);
    assert.equal(eintrag.bisMinute, 8 * 60);
    assert.equal(eintrag.laeuftUeberMitternacht, false);
  });
});

describe("Sommerzeit-Grenzfälle (Europe/Berlin, 2026)", () => {
  it("überspringt die fehlende Stunde bei der Umstellung im März", () => {
    // Umstellung: Sonntag 29.03.2026, 01:00 UTC. Danach gilt UTC+2.
    // 00:30 UTC = 01:30 Ortszeit (noch UTC+1).
    const vorher = ordneTermineTagen(
      [termin("vor", "2026-03-29T00:30:00Z", "2026-03-29T01:00:00Z")],
      BERLIN,
    ).get("2026-03-29")?.[0];
    assert.ok(vorher);
    assert.equal(vorher.vonMinute, 90); // 01:30
    // 01:30 UTC = 03:30 Ortszeit (schon UTC+2) — 02:30 existiert nicht.
    const nachher = ordneTermineTagen(
      [termin("nach", "2026-03-29T01:30:00Z", "2026-03-29T02:00:00Z")],
      BERLIN,
    ).get("2026-03-29")?.[0];
    assert.ok(nachher);
    assert.equal(nachher.vonMinute, 210); // 03:30
    // Gemessen: 60 Minuten UTC-Abstand ergeben 120 Minuten Ortszeit.
    assert.equal(nachher.vonMinute - vorher.vonMinute, 120);
    assert.equal(nachher.tag, vorher.tag);
  });

  it("legt die doppelte Stunde bei der Umstellung im Oktober auf denselben Tag", () => {
    // Umstellung: Sonntag 25.10.2026, 01:00 UTC. Danach gilt UTC+1.
    // 00:30 UTC = 02:30 Ortszeit (noch UTC+2) …
    const erste = ordneTermineTagen(
      [termin("a", "2026-10-25T00:30:00Z", "2026-10-25T01:00:00Z")],
      BERLIN,
    ).get("2026-10-25")?.[0];
    // … und 01:30 UTC = wieder 02:30 Ortszeit (jetzt UTC+1).
    const zweite = ordneTermineTagen(
      [termin("b", "2026-10-25T01:30:00Z", "2026-10-25T02:00:00Z")],
      BERLIN,
    ).get("2026-10-25")?.[0];
    assert.ok(erste && zweite);
    // Gemessen: 60 Minuten UTC-Abstand ergeben hier 0 Minuten Ortszeit, die
    // beiden Termine tragen dieselbe Uhrzeit und landen am selben Tag.
    assert.equal(erste.vonMinute, 150);
    assert.equal(zweite.vonMinute, 150);
    assert.equal(zweite.vonMinute - erste.vonMinute, 0);
    assert.equal(erste.tag, "2026-10-25");
    assert.equal(zweite.tag, "2026-10-25");
  });

  it("behandelt den Monatswechsel in Werkstatt-Zeit an Silvester richtig", () => {
    // 31.12.2026, 23:30 UTC = 01.01.2027, 00:30 Berlin (Winterzeit UTC+1).
    const karte = ordneTermineTagen(
      [termin("a", "2026-12-31T23:30:00Z", "2027-01-01T00:30:00Z")],
      BERLIN,
    );
    assert.equal(karte.has("2026-12-31"), false);
    const eintrag = karte.get("2027-01-01")?.[0];
    assert.ok(eintrag);
    assert.equal(eintrag.vonMinute, 30);
    assert.equal(eintrag.laeuftUeberMitternacht, false);
  });

  it("liefert 'heute' in der Zeitzone der Werkstatt, nicht in Serverzeit", () => {
    // Fester Zeitpunkt: 06.10.2026, 23:30 UTC = 07.10.2026, 01:30 Berlin.
    const jetzt = new Date("2026-10-06T23:30:00Z");
    assert.equal(heuteInZeitzone(BERLIN, jetzt), "2026-10-07");
    assert.equal(heuteInZeitzone("UTC", jetzt), "2026-10-06");
    // 01:30 UTC am 01.01.2027 ist in Berlin bereits 02:30 desselben Tages,
    // am 31.12.2026 um 23:30 UTC dagegen schon der 1. Januar.
    assert.equal(heuteInZeitzone(BERLIN, new Date("2026-12-31T23:30:00Z")), "2027-01-01");
    assert.equal(heuteInZeitzone(BERLIN, new Date("2027-01-01T00:30:00Z")), "2027-01-01");
  });
});

/* -------------------------------------------------------------------------- */
/* Offene Anfragen                                                            */
/* -------------------------------------------------------------------------- */

describe("Offene Anfragen je Tag", () => {
  it("erkennt offene von entschiedenen Anfragen", () => {
    assert.equal(istOffen({ status: "neu" }), true);
    assert.equal(istOffen({ status: "bestaetigt" }), false);
    assert.equal(istOffen({ status: "abgelehnt" }), false);
    assert.equal(istOffen({ status: "" }), false);
  });

  it("prüft den Wunschzeitraum an seinen Grenzen (beide Grenzen gehören dazu)", () => {
    const mitBeiden = anfrage("1", { wunschVon: "2026-10-06", wunschBis: "2026-10-08" });
    assert.equal(istWunschtag(mitBeiden, "2026-10-05"), false);
    assert.equal(istWunschtag(mitBeiden, "2026-10-06"), true);
    assert.equal(istWunschtag(mitBeiden, "2026-10-07"), true);
    assert.equal(istWunschtag(mitBeiden, "2026-10-08"), true);
    assert.equal(istWunschtag(mitBeiden, "2026-10-09"), false);

    // Nur "von": ab diesem Tag offen, ohne Ende.
    const nurVon = anfrage("2", { wunschVon: "2026-10-06" });
    assert.equal(istWunschtag(nurVon, "2026-10-05"), false);
    assert.equal(istWunschtag(nurVon, "2026-10-06"), true);
    assert.equal(istWunschtag(nurVon, "2027-06-01"), true);

    // Nur "bis": bis zu diesem Tag offen.
    const nurBis = anfrage("3", { wunschBis: "2026-10-06" });
    assert.equal(istWunschtag(nurBis, "2026-10-06"), true);
    assert.equal(istWunschtag(nurBis, "2026-10-07"), false);
    assert.equal(istWunschtag(nurBis, "2025-01-01"), true);

    // Ohne Zeitraum: keinem Tag zuordenbar.
    assert.equal(istWunschtag(anfrage("4"), "2026-10-06"), false);
  });

  it("liefert nur offene Anfragen des Tages, nach Referenz sortiert", () => {
    const anfragen = [
      anfrage("1", { reference: "ANF-2026-0003", wunschVon: "2026-10-06", wunschBis: "2026-10-06" }),
      anfrage("2", { reference: "ANF-2026-0001", wunschVon: "2026-10-05", wunschBis: "2026-10-07" }),
      anfrage("3", {
        reference: "ANF-2026-0002",
        status: "bestaetigt",
        wunschVon: "2026-10-06",
        wunschBis: "2026-10-06",
      }),
      anfrage("4", { reference: "ANF-2026-0004", wunschVon: "2026-10-09", wunschBis: "2026-10-10" }),
    ];
    const treffer = anfragenAmTag(anfragen, "2026-10-06");
    assert.deepEqual(
      treffer.map((eintrag) => eintrag.reference),
      ["ANF-2026-0001", "ANF-2026-0003"],
    );
    assert.deepEqual(anfragenAmTag(anfragen, "2026-10-09").map((a) => a.id), ["4"]);
    assert.deepEqual(anfragenAmTag(anfragen, "2026-10-01"), []);
  });

  it("sammelt offene Anfragen ohne jeden Wunschzeitraum getrennt", () => {
    const anfragen = [
      anfrage("1"),
      anfrage("2", { wunschVon: "2026-10-06" }),
      anfrage("3", { status: "abgelehnt" }),
      anfrage("4", { reference: "ANF-0001" }),
    ];
    assert.deepEqual(anfragenOhneZeitraum(anfragen).map((a) => a.id), ["4", "1"]);
  });

  it("findet offene Anfragen im Zeitraum eines Monats ohne Doppelte", () => {
    const anfragen = [
      anfrage("1", { wunschVon: "2026-10-06", wunschBis: "2026-10-30" }),
      anfrage("2", { wunschVon: "2026-09-28", wunschBis: "2026-10-02" }),
      anfrage("3", { wunschVon: "2026-11-02", wunschBis: "2026-11-03" }),
      anfrage("4", { wunschVon: "2026-10-07" }),
    ];
    const treffer = anfragenImZeitraum(anfragen, "2026-10-01", "2026-10-31");
    // Anfrage 1 deckt 25 Tage ab, darf aber nur einmal in der Liste stehen.
    assert.deepEqual(treffer.map((a) => a.id), ["1", "2", "4"]);
  });

  it("gibt bei unbrauchbarem Zeitraum nichts zurück", () => {
    const anfragen = [anfrage("1", { wunschVon: "2026-10-06" })];
    // Ende vor Beginn.
    assert.deepEqual(anfragenImZeitraum(anfragen, "2026-10-31", "2026-10-01"), []);
    // Zu langer Zeitraum (Schutz gegen versehentlich riesige Schleifen).
    assert.deepEqual(anfragenImZeitraum(anfragen, "2026-01-01", "2027-12-31"), []);
  });
});

/* -------------------------------------------------------------------------- */
/* Kennzahlen                                                                 */
/* -------------------------------------------------------------------------- */

describe("Kennzahlen der Kalenderansicht", () => {
  const termine = [
    termin("1", "2026-10-06T06:00:00Z", "2026-10-06T07:00:00Z"),
    termin("2", "2026-10-06T09:00:00Z", "2026-10-06T10:00:00Z"),
    termin("3", "2026-10-07T06:00:00Z", "2026-10-07T07:00:00Z"),
    // 22:30 UTC am 31.10. = 23:30 Berlin am 31.10. (nach der Umstellung am
    // 25.10. gilt wieder UTC+1) → gehört noch in den Oktober. Gemessen: erst
    // ab 23:00 UTC wäre dieser Termin in Werkstatt-Zeit der 01.11.
    termin("4", "2026-10-31T22:30:00Z", "2026-10-31T23:30:00Z"),
  ];
  const anfragen = [
    anfrage("a", { wunschVon: "2026-10-06", wunschBis: "2026-10-10" }),
    anfrage("b", { status: "abgelehnt", wunschVon: "2026-10-06" }),
    anfrage("c"),
  ];

  it("zählt Termine, belegte Tage und offene Anfragen des Monats", () => {
    const kennzahlen = berechneKalenderKennzahlen(
      "2026-10",
      termine,
      anfragen,
      BERLIN,
      "2026-10-06",
      ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-31", "2026-11-02"],
    );
    // Gemessen: alle vier Termine liegen in Werkstatt-Zeit im Oktober (siehe
    // Kommentar an Termin 4), belegt sind die drei Tage 06., 07. und 31.10.
    assert.equal(kennzahlen.termineImMonat, 4);
    assert.equal(kennzahlen.termineHeute, 2);
    assert.equal(kennzahlen.belegteTage, 3);
    assert.equal(kennzahlen.offeneAnfragenImMonat, 1);
    assert.equal(kennzahlen.offeneAnfragenOhneZeitraum, 1);
    // 4 der übergebenen Öffnungstage liegen im Oktober (05., 06., 07., 31.),
    // 3 davon sind belegt → 75 %.
    assert.equal(kennzahlen.auslastungProzent, 75);
  });

  it("meldet 0 % Auslastung, wenn im Monat kein Tag geöffnet ist", () => {
    const kennzahlen = berechneKalenderKennzahlen("2026-10", termine, [], BERLIN, "2026-10-06", []);
    assert.equal(kennzahlen.auslastungProzent, 0);
    assert.equal(kennzahlen.termineImMonat, 4);
    assert.equal(kennzahlen.termineHeute, 2);
    assert.equal(kennzahlen.offeneAnfragenImMonat, 0);
  });
});
