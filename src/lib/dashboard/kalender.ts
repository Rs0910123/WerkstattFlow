/**
 * Termin- und Kalenderlogik des Werkstatt-Dashboards (Baustein 3, Teil B1b).
 *
 * Reine Funktionen — keine Datenbank, kein DOM, kein `Date`-Zufall: geprüft in
 * tests/dashboard/kalender.test.ts. Die Datenbank liefert nur Zeitstempel
 * (ISO mit Zeitzone) und naive Wunschzeiträume; alles andere (Monatsraster,
 * Tageszuordnung, Zeitzonen-Grenzfälle) entsteht hier.
 *
 * Wiederverwendet wird die vorhandene Zeit- und Datumslogik:
 *   * `monatsRaster()` aus src/lib/portal/kalender.ts — das Raster der
 *     Kundenportal-Ansicht, damit beide Kalender gleich aussehen.
 *   * `zerlegeInWerkstattZeit()`, `formatiereSlot()`, `formatiereMinute()`,
 *     `datumPlusTage()`, `wochentagIso()`, `vergleicheDatum()` aus
 *     src/lib/portal/format.ts.
 * Eine zweite Zeitrechnung gibt es bewusst nicht.
 *
 * Zentrale Entscheidung: Ein Termin gehört zu dem Tag, an dem er in der
 * Zeitzone der Werkstatt BEGINNT (nicht in der Zeitzone des Servers). Termine,
 * die über Mitternacht laufen, werden zusätzlich markiert.
 */

import {
  datumPlusTage,
  formatiereSlot,
  jetztInZeitzone,
  tageZwischen,
  vergleicheDatum,
  wochentagIso,
  zerlegeInWerkstattZeit,
} from "../portal/format.ts";
import { monatsRaster } from "../portal/kalender.ts";

/** Ein Termin, wie ihn die Kalenderansicht braucht (aus der Datenbank befüllt). */
export type KalenderTermin = {
  id: string;
  titel: string;
  startsAt: string;
  endsAt: string;
  status: string;
  bay: string | null;
  kunde: string | null;
  fahrzeug: string | null;
  leistung: string | null;
  referenz: string | null;
  anfrageId: string | null;
};

/** Ein Termin mit seiner Zuordnung zu Tag und Uhrzeit in Werkstatt-Zeit. */
export type TerminImTag = KalenderTermin & {
  /** "YYYY-MM-DD" in der Zeitzone der Werkstatt. */
  tag: string;
  vonMinute: number;
  bisMinute: number;
  /** z. B. "08:00–09:00 Uhr" */
  uhrzeit: string;
  /** true, wenn der Termin nach Mitternacht endet (Folgetag). */
  laeuftUeberMitternacht: boolean;
};

/** Eine offene Anfrage mit Wunschzeitraum (aus der Datenbank befüllt). */
export type KalenderAnfrage = {
  id: string;
  reference: string;
  serviceType: string;
  status: string;
  wunschVon: string | null;
  wunschBis: string | null;
  zeitHinweis: string | null;
  kunde: string | null;
  fahrzeug: string | null;
  preisHinweis: string | null;
};

/** Statuswerte, die als "offen / noch nicht entschieden" gelten. */
export const OFFENE_STATUS = ["neu"] as const;

/* -------------------------------------------------------------------------- */
/* Abfragezeitraum                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Zeitraum für die Datenbankabfrage.
 *
 * `starts_at`/`ends_at` sind Zeitstempel mit Zeitzone. Die Grenzen eines Tages
 * hängen damit von der Zeitzone der Werkstatt ab (Sommer-/Winterzeit). Statt
 * eine zweite Zeitzonenrechnung in SQL nachzubauen, fragen wir bewusst einen um
 * je einen Tag erweiterten Bereich in UTC ab und ordnen die Termine danach in
 * JavaScript der Werkstatt-Zeit zu. Ein Tag Rand deckt jede Zeitzone der Welt
 * ab (maximal ±14 Stunden Versatz) — die Ansicht filtert anschließend exakt.
 */
export function zerlegeZeitraum(
  vonTag: string,
  bisTag: string,
): { vonIso: string; bisIso: string } {
  const von = datumPlusTage(vonTag, -1);
  const bis = datumPlusTage(bisTag, 1);
  return { vonIso: `${von}T00:00:00.000Z`, bisIso: `${bis}T23:59:59.999Z` };
}

/* -------------------------------------------------------------------------- */
/* Monat, Woche, Navigation                                                   */
/* -------------------------------------------------------------------------- */

/** Ist der Text ein Monat im Format "YYYY-MM"? */
export function istMonatParam(wert: unknown): wert is string {
  if (typeof wert !== "string" || !/^\d{4}-\d{2}$/.test(wert)) return false;
  const monat = Number(wert.slice(5, 7));
  return monat >= 1 && monat <= 12;
}

/** Monat ("YYYY-MM") aus einem Tag ("YYYY-MM-DD"). */
export function monatAusTag(tag: string): string {
  return tag.slice(0, 7);
}

/** Monat verschieben: monatPlus("2026-12", 1) === "2027-01". */
export function monatPlus(monat: string, delta: number): string {
  const jahr = Number(monat.slice(0, 4));
  const nummer = Number(monat.slice(5, 7)) - 1;
  if (!Number.isFinite(jahr) || !Number.isFinite(nummer)) return monat;
  const gesamt = jahr * 12 + nummer + delta;
  const neuesJahr = Math.floor(gesamt / 12);
  const neuerMonat = ((gesamt % 12) + 12) % 12;
  return `${String(neuesJahr).padStart(4, "0")}-${String(neuerMonat + 1).padStart(2, "0")}`;
}

/** Alle Tage eines Monats als "YYYY-MM-DD". */
export function monatsTage(monat: string): string[] {
  const jahr = Number(monat.slice(0, 4));
  const nummer = Number(monat.slice(5, 7));
  if (!Number.isFinite(jahr) || !Number.isFinite(nummer)) return [];
  const anzahl = new Date(Date.UTC(jahr, nummer, 0)).getUTCDate();
  const tage: string[] = [];
  for (let tag = 1; tag <= anzahl; tag += 1) {
    tage.push(`${monat}-${String(tag).padStart(2, "0")}`);
  }
  return tage;
}

/** Erster und letzter Tag eines Monats. */
export function monatsGrenzen(monat: string): { von: string; bis: string } {
  const tage = monatsTage(monat);
  if (tage.length === 0) return { von: `${monat}-01`, bis: `${monat}-01` };
  return { von: tage[0], bis: tage[tage.length - 1] };
}

/** Die sieben Tage der Woche, in der `tag` liegt (Montag bis Sonntag). */
export function wochenTage(tag: string): string[] {
  const montag = datumPlusTage(tag, -(wochentagIso(tag) - 1));
  return Array.from({ length: 7 }, (_, i) => datumPlusTage(montag, i));
}

/** Woche verschieben (um 7 Tage je Schritt). */
export function wochenVersatz(tag: string, wochen: number): string {
  return datumPlusTage(tag, wochen * 7);
}

/** Nächster Tag mit Termin in der angegebenen Richtung, sonst null. */
export function naechsterTagMitTermin(
  tage: string[],
  termineJeTag: Map<string, TerminImTag[]>,
  richtung: 1 | -1,
): string | null {
  for (const tag of richtung === 1 ? tage : [...tage].reverse()) {
    if ((termineJeTag.get(tag)?.length ?? 0) > 0) return tag;
  }
  return null;
}

/** Monat ("YYYY-MM") aus einem beliebigen Suchparameter, sonst der laufende. */
export function normalisiereMonat(wert: unknown, heute: string): string {
  return istMonatParam(wert) ? wert : monatAusTag(heute);
}

/** Tag ("YYYY-MM-DD") aus einem Suchparameter, sofern er ein echtes Datum ist. */
export function normalisiereTag(wert: unknown): string | null {
  if (typeof wert !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return null;
  const [jahr, monat, tag] = wert.split("-").map(Number);
  const geprueft = new Date(Date.UTC(jahr, monat - 1, tag));
  const echt =
    geprueft.getUTCFullYear() === jahr &&
    geprueft.getUTCMonth() === monat - 1 &&
    geprueft.getUTCDate() === tag;
  return echt ? wert : null;
}

/** "heute" in der Zeitzone der Werkstatt (der Server darf in UTC stehen). */
export function heuteInZeitzone(zeitzone: string, jetzt: Date = new Date()): string {
  return jetztInZeitzone(zeitzone, jetzt).slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Tageszuordnung                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Termine auf Tage verteilen (Schlüssel "YYYY-MM-DD", Wert sortierte Liste).
 * Termine ohne gültigen Zeitstempel werden übersprungen.
 */
export function ordneTermineTagen(
  termine: readonly KalenderTermin[],
  zeitzone: string,
): Map<string, TerminImTag[]> {
  const karte = new Map<string, TerminImTag[]>();

  for (const termin of termine) {
    const beginn = zerlegeInWerkstattZeit(termin.startsAt, zeitzone);
    if (!beginn) continue;
    const ende = zerlegeInWerkstattZeit(termin.endsAt, zeitzone);

    const eintrag: TerminImTag = {
      ...termin,
      tag: beginn.tag,
      vonMinute: beginn.minute,
      bisMinute: ende ? (ende.tag === beginn.tag ? ende.minute : 24 * 60) : beginn.minute,
      uhrzeit:
        ende && ende.tag === beginn.tag
          ? formatiereSlot(beginn.minute, ende.minute)
          : `ab ${beginn.zeit} Uhr`,
      laeuftUeberMitternacht: ende !== null && ende.tag !== beginn.tag,
    };

    const bisher = karte.get(beginn.tag);
    if (bisher) bisher.push(eintrag);
    else karte.set(beginn.tag, [eintrag]);
  }

  for (const liste of karte.values()) {
    liste.sort((a, b) => a.vonMinute - b.vonMinute || a.titel.localeCompare(b.titel, "de"));
  }
  return karte;
}

/** Termine eines konkreten Tages, aufsteigend nach Uhrzeit. */
export function termineAmTag(
  termine: readonly KalenderTermin[],
  tag: string,
  zeitzone: string,
): TerminImTag[] {
  return ordneTermineTagen(termine, zeitzone).get(tag) ?? [];
}

/** Belegte Zeitfenster eines Tages als Minutenpaare (für Auslastungshinweise). */
export function belegteFenster(tage: readonly TerminImTag[]): { von: number; bis: number }[] {
  return tage.map((termin) => ({ von: termin.vonMinute, bis: termin.bisMinute }));
}

/* -------------------------------------------------------------------------- */
/* Offene Anfragen am Tag                                                     */
/* -------------------------------------------------------------------------- */

/** Gilt die Anfrage als offen (noch nicht entschieden)? */
export function istOffen(anfrage: Pick<KalenderAnfrage, "status">): boolean {
  return (OFFENE_STATUS as readonly string[]).includes(anfrage.status);
}

/**
 * Ist eine offene Anfrage für diesen Tag relevant?
 *
 * Relevant ist sie, wenn der WUNSCHZEITRAUM des Kunden den Tag enthält. Sind nur
 * eine Grenze oder gar keine gepflegt, gilt:
 *   * nur "von"  → ab diesem Tag offen (kein Ende vereinbart)
 *   * nur "bis"  → bis zu diesem Tag offen
 *   * keine      → keinem Tag zuordenbar (eigene Liste in der Oberfläche)
 */
export function istWunschtag(anfrage: KalenderAnfrage, tag: string): boolean {
  const von = anfrage.wunschVon;
  const bis = anfrage.wunschBis;
  if (von && bis) return vergleicheDatum(von, tag) <= 0 && vergleicheDatum(tag, bis) <= 0;
  if (von) return vergleicheDatum(von, tag) <= 0;
  if (bis) return vergleicheDatum(tag, bis) <= 0;
  return false;
}

/** Offene Anfragen, die für diesen Tag relevant sind (nach Referenz sortiert). */
export function anfragenAmTag(
  anfragen: readonly KalenderAnfrage[],
  tag: string,
): KalenderAnfrage[] {
  return anfragen
    .filter((anfrage) => istOffen(anfrage) && istWunschtag(anfrage, tag))
    .sort((a, b) => a.reference.localeCompare(b.reference, "de"));
}

/** Offene Anfragen ohne jeden Wunschzeitraum. */
export function anfragenOhneZeitraum(
  anfragen: readonly KalenderAnfrage[],
): KalenderAnfrage[] {
  return anfragen
    .filter((anfrage) => istOffen(anfrage) && !anfrage.wunschVon && !anfrage.wunschBis)
    .sort((a, b) => a.reference.localeCompare(b.reference, "de"));
}

/** Offene Anfragen, deren Wunschzeitraum sich mit dem Zeitraum überschneidet. */
export function anfragenImZeitraum(
  anfragen: readonly KalenderAnfrage[],
  vonTag: string,
  bisTag: string,
): KalenderAnfrage[] {
  const tage = tageZwischen(vonTag, bisTag);
  if (tage < 0 || tage > 120) return [];
  const treffer: KalenderAnfrage[] = [];
  for (let i = 0; i <= tage; i += 1) {
    for (const anfrage of anfragenAmTag(anfragen, datumPlusTage(vonTag, i))) {
      if (!treffer.some((eintrag) => eintrag.id === anfrage.id)) treffer.push(anfrage);
    }
  }
  return treffer.sort((a, b) => a.reference.localeCompare(b.reference, "de"));
}

/* -------------------------------------------------------------------------- */
/* Raster für die Monatsansicht                                               */
/* -------------------------------------------------------------------------- */

export type Kalenderzelle = {
  /** "YYYY-MM-DD" oder null für eine Leerzelle des Rasters. */
  tag: string | null;
  /** false, wenn der Tag zu einem Nachbarmonat gehört. */
  imMonat: boolean;
  terminAnzahl: number;
  anfrageAnzahl: number;
  terminTitel: string[];
};

/**
 * Zellen der Monatsansicht (6 Wochen, Montag zuerst — dasselbe Raster wie im
 * Kundenportal). Leerzellen sind immer 42 Zellen, damit die Ansicht beim
 * Blättern nicht springt.
 */
export function monatsZellen(
  monat: string,
  termineJeTag: Map<string, TerminImTag[]>,
  anfragen: readonly KalenderAnfrage[],
): Kalenderzelle[] {
  const jahr = Number(monat.slice(0, 4));
  const nummer = Number(monat.slice(5, 7));
  if (!Number.isFinite(jahr) || !Number.isFinite(nummer)) return [];

  return monatsRaster(jahr, nummer).map((tag) => {
    if (tag === null) {
      return { tag: null, imMonat: false, terminAnzahl: 0, anfrageAnzahl: 0, terminTitel: [] };
    }
    const termine = termineJeTag.get(tag) ?? [];
    return {
      tag,
      imMonat: tag.startsWith(monat),
      terminAnzahl: termine.length,
      anfrageAnzahl: anfragenAmTag(anfragen, tag).length,
      terminTitel: termine.map((termin) => termin.titel).slice(0, 3),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Kennzahlen                                                                 */
/* -------------------------------------------------------------------------- */

export type KalenderKennzahlen = {
  termineImMonat: number;
  termineHeute: number;
  offeneAnfragenImMonat: number;
  offeneAnfragenOhneZeitraum: number;
  belegteTage: number;
  auslastungProzent: number;
};

/**
 * Kennzahlen für den Kopf der Kalenderansicht.
 * `auslastungProzent` = belegte Tage im Verhältnis zu den Tagen des Monats, die
 * laut Öffnungszeiten überhaupt Termine erlauben (geöffnete Tage bis "heute").
 */
export function berechneKalenderKennzahlen(
  monat: string,
  termine: readonly KalenderTermin[],
  anfragen: readonly KalenderAnfrage[],
  zeitzone: string,
  heute: string,
  geoeffneteTage: readonly string[],
): KalenderKennzahlen {
  const termineJeTag = ordneTermineTagen(termine, zeitzone);
  const { von, bis } = monatsGrenzen(monat);
  const tageImMonat = monatsTage(monat);

  const termineImMonat = tageImMonat.reduce(
    (summe, tag) => summe + (termineJeTag.get(tag)?.length ?? 0),
    0,
  );
  const belegteTage = tageImMonat.filter((tag) => (termineJeTag.get(tag)?.length ?? 0) > 0).length;
  const moeglicheTage = geoeffneteTage.filter((tag) => tageImMonat.includes(tag)).length;

  return {
    termineImMonat,
    termineHeute: termineJeTag.get(heute)?.length ?? 0,
    offeneAnfragenImMonat: anfragenImZeitraum(anfragen, von, bis).length,
    offeneAnfragenOhneZeitraum: anfragenOhneZeitraum(anfragen).length,
    belegteTage,
    auslastungProzent:
      moeglicheTage > 0 ? Math.round((belegteTage / moeglicheTage) * 100) : 0,
  };
}
