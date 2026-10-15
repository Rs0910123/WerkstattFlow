/**
 * Regelbasierte Preisschätzung für das Kundenportal.
 *
 * Reine Funktion ohne Datenbank- oder Netzwerkzugriff (tests/preisschaetzung.test.ts):
 * Aus Leistungsart und Fahrzeugdaten entsteht eine SPANNE (von–bis) in Euro,
 * gerundet auf 5 Euro. Sie ist ausdrücklich eine unverbindliche Schätzung —
 * der Hinweistext wird zusammen mit der Anfrage gespeichert und dem Kunden
 * angezeigt.
 *
 * Regeln (Stand Baustein 2):
 *   1. Basis: Preisrahmen der gewählten Leistungsart (leistungen.ts).
 *   2. Alter: ab 10 Jahren +8 %, ab 15 Jahren +15 % (mehr Rost, feste Schrauben).
 *   3. Laufleistung: ab 150.000 km +8 %, ab 250.000 km +15 % (mehr Verschleiß).
 *   4. Elektrofahrzeug bei Inspektion: −10 % (kein Motoröl, weniger Verschleißteile).
 *   5. Rundung: beide Grenzen auf volle 5 Euro — die Untergrenze abwärts, die
 *      Obergrenze aufwärts. Die Spanne ist damit bewusst etwas weiter und
 *      verspricht keine Zahl, die wir nicht halten können.
 *
 * Die Zuschläge/Abzüge werden als Text mitgeliefert, damit der Kunde sieht,
 * wie die Spanne zustande kommt.
 */

import { leistungNachLabel } from "./leistungen.ts";

export type Fahrzeugdaten = {
  baujahr?: number | null;
  kilometerstand?: number | null;
  kraftstoff?: string | null;
};

export type Preisschaetzung = {
  min: number;
  max: number;
  /** Zuschläge und Abzüge in verständlichem Deutsch. */
  gruende: string[];
  /** Unverbindlichkeitshinweis — wird so an der Anfrage gespeichert. */
  hinweis: string;
};

export const PREISSCHAETZUNG_HINWEIS =
  "Unverbindliche Schätzung auf Grundlage Ihrer Angaben – kein verbindliches Angebot. " +
  "Der endgültige Preis ergibt sich nach Prüfung des Fahrzeugs in der Werkstatt.";

/** Untergrenze auf volle 5 Euro abrunden. */
function abwaerts5(wert: number): number {
  return Math.floor(wert / 5) * 5;
}

/** Obergrenze auf volle 5 Euro aufrunden. */
function aufwaerts5(wert: number): number {
  return Math.ceil(wert / 5) * 5;
}

/**
 * Preisspanne für eine Leistung und ein Fahrzeug.
 * Liefert `null`, wenn die Leistungsart unbekannt ist (dann zeigt die
 * Oberfläche bewusst keine Zahl an, statt eine falsche zu erfinden).
 */
export function schaetzePreis(
  leistung: string,
  fahrzeug: Fahrzeugdaten = {},
  bezugsJahr: number = new Date().getFullYear(),
): Preisschaetzung | null {
  const art = leistungNachLabel(leistung);
  if (!art) return null;

  let faktor = 1;
  const gruende: string[] = [];

  const baujahr =
    typeof fahrzeug.baujahr === "number" && fahrzeug.baujahr >= 1886
      ? fahrzeug.baujahr
      : null;
  if (baujahr !== null) {
    const alter = Math.max(0, bezugsJahr - baujahr);
    if (alter >= 15) {
      faktor += 0.15;
      gruende.push(`Fahrzeug älter als 15 Jahre (+15 %)`);
    } else if (alter >= 10) {
      faktor += 0.08;
      gruende.push("Fahrzeug älter als 10 Jahre (+8 %)");
    }
  }

  const km =
    typeof fahrzeug.kilometerstand === "number" && fahrzeug.kilometerstand >= 0
      ? fahrzeug.kilometerstand
      : null;
  if (km !== null) {
    if (km >= 250_000) {
      faktor += 0.15;
      gruende.push("Laufleistung über 250.000 km (+15 %)");
    } else if (km >= 150_000) {
      faktor += 0.08;
      gruende.push("Laufleistung über 150.000 km (+8 %)");
    }
  }

  if (
    fahrzeug.kraftstoff === "elektro" &&
    art.label === "Inspektion / Wartung"
  ) {
    faktor -= 0.1;
    gruende.push("Elektrofahrzeug: keine Motoröl- und Zündungsposten (−10 %)");
  }

  // Untergrenze des Faktors begrenzen, damit die Spanne nicht ins Absurde läuft.
  const sichererFaktor = Math.max(0.6, Math.min(2, faktor));

  const min = abwaerts5(art.basis.min * sichererFaktor);
  const max = Math.max(min, aufwaerts5(art.basis.max * sichererFaktor));

  return {
    min,
    max,
    gruende,
    hinweis: PREISSCHAETZUNG_HINWEIS,
  };
}

/** "ab 249 €" — für die Leistungsübersicht auf der Werkstatt-Seite. */
export function formatierePreisAb(betrag: number): string {
  return `ab ${betrag} €`;
}

/** "249 € – 429 €" */
export function formatiereSpanne(min: number, max: number): string {
  if (min === max) return `${min} €`;
  return `${min} € – ${max} €`;
}
