/**
 * Schrittfolge und Schrittprüfung des mehrstufigen Anfrageformulars.
 *
 * Reine Funktionen ohne React und ohne Datenbank (tests/portal/formular.test.ts):
 * Sie legen fest, welche Felder zu welchem Schritt gehören und welche deutschen
 * Fehlermeldungen im aktuellen Schritt angezeigt werden. Geprüft wird mit
 * `parseAnfrageFormular()` — es gibt also nur EINE Quelle für die Meldungen
 * (Oberfläche und Server verwenden dieselbe Validierung).
 */

import {
  EINWILLIGUNG_FELD,
  HONEYPOT_FELD,
  parseAnfrageFormular,
  type PruefEingabe,
} from "./anfrage-schema.ts";

export type FormularSchritt = {
  /** Überschrift des Schritts. */
  titel: string;
  /** Ein Satz, was in diesem Schritt zu tun ist. */
  beschreibung: string;
  /** Formularfelder dieses Schritts (Honeypot gehört zu keinem Schritt). */
  felder: string[];
};

export const ANFRAGE_SCHRITTE: FormularSchritt[] = [
  {
    titel: "Anliegen",
    beschreibung: "Was sollen wir an Ihrem Fahrzeug machen?",
    felder: ["service_type", "description"],
  },
  {
    titel: "Fahrzeug",
    beschreibung: "Damit wir den Aufwand einschätzen können.",
    felder: [
      "license_plate",
      "vehicle_make",
      "vehicle_model",
      "vehicle_year",
      "vehicle_mileage",
      "vehicle_fuel_type",
    ],
  },
  {
    titel: "Kontakt",
    beschreibung: "Wie erreichen wir Sie am besten?",
    felder: [
      "first_name",
      "last_name",
      "email",
      "phone",
      "contact_preference",
      EINWILLIGUNG_FELD,
    ],
  },
  {
    titel: "Abschluss",
    beschreibung: "Bitte prüfen Sie Ihre Angaben und senden Sie die Anfrage ab.",
    felder: [],
  },
];

/** Felder, die zu keinem sichtbaren Schritt gehören, aber geprüft werden müssen. */
export const RAHMEN_FELDER = [
  "preferred_date",
  "slot_start",
  "slot_end",
  HONEYPOT_FELD,
];

export const ANZAHL_SCHRITTE = ANFRAGE_SCHRITTE.length;

export function istLetzterSchritt(schritt: number): boolean {
  return schritt >= ANZAHL_SCHRITTE - 1;
}

/** Feldnamen, die zu einem Schritt gehören. */
export function felderDesSchritts(schritt: number): string[] {
  const eintrag = ANFRAGE_SCHRITTE[schritt];
  if (!eintrag) return [];
  return schritt === 0 ? [...eintrag.felder, ...RAHMEN_FELDER] : eintrag.felder;
}

/**
 * Fehler des aktuellen Schritts. Es wird immer das ganze Formular geprüft,
 * damit auch die Terminwahl (Tag/Slot) und die Kombination E-Mail/Telefon
 * auffallen; angezeigt werden aber nur die Fehler dieses Schritts.
 */
export function pruefeSchritt(
  eingabe: PruefEingabe,
  schritt: number,
  optionen: { heute: string },
): Record<string, string> {
  const ergebnis = parseAnfrageFormular(eingabe, optionen);
  if (ergebnis.erfolg) return {};

  const erlaubte = new Set(felderDesSchritts(schritt));
  const fehler: Record<string, string> = {};
  for (const [feld, meldung] of Object.entries(ergebnis.fehler)) {
    if (erlaubte.has(feld)) fehler[feld] = meldung;
  }
  return fehler;
}

/** Ist der Schritt vollständig ausgefüllt? */
export function istSchrittVollstaendig(
  eingabe: PruefEingabe,
  schritt: number,
  optionen: { heute: string },
): boolean {
  return Object.keys(pruefeSchritt(eingabe, schritt, optionen)).length === 0;
}

/**
 * Erster Schritt, in dem ein Fehler liegt (0-basiert) — damit die Oberfläche
 * nach einem Serverfehler direkt dorthin springen kann. -1 = kein Fehler.
 */
export function ersterSchrittMitFehler(fehler: Record<string, string>): number {
  const namen = Object.keys(fehler);
  if (namen.length === 0) return -1;
  for (let schritt = 0; schritt < ANZAHL_SCHRITTE; schritt += 1) {
    const erlaubte = new Set(felderDesSchritts(schritt));
    if (namen.some((name) => erlaubte.has(name))) return schritt;
  }
  return ANZAHL_SCHRITTE - 1;
}

/** Alle Fehlermeldungen in einer festen Reihenfolge (für die Zusammenfassung). */
export function sortiereFehler(
  fehler: Record<string, string>,
): { feld: string; meldung: string }[] {
  const reihenfolge = [
    ...ANFRAGE_SCHRITTE.flatMap((schritt) => schritt.felder),
    ...RAHMEN_FELDER,
    "formular",
  ];
  return Object.entries(fehler)
    .map(([feld, meldung]) => ({ feld, meldung }))
    .sort((a, b) => {
      const ia = reihenfolge.indexOf(a.feld);
      const ib = reihenfolge.indexOf(b.feld);
      const ra = ia === -1 ? reihenfolge.length : ia;
      const rb = ib === -1 ? reihenfolge.length : ib;
      return ra === rb ? a.feld.localeCompare(b.feld) : ra - rb;
    });
}
