/**
 * Leistungskatalog des Kundenportals.
 *
 * Der Katalog ist bewusst fest im Code (erster Anwendungsfall: Kfz-Werkstatt)
 * — eine je Werkstatt pflegbare Liste kommt mit den Einstellungen in
 * Baustein 3. Die Preisschätzung (preisschaetzung.ts) baut auf denselben
 * Einträgen auf, damit Anzeige und Rechnung nie auseinanderlaufen.
 */

export type Leistungsart = {
  /** Wird so in public.requests.service_type gespeichert. */
  label: string;
  /** Kurzbeschreibung für die Auswahl im Formular. */
  beschreibung: string;
  /** Typischer Preisrahmen in Euro (Basis der Preisschätzung). */
  basis: { min: number; max: number };
  /** Hinweis zur Dauer — erscheint als Zusatz an der Leistung. */
  dauer: string;
};

export const LEISTUNGSARTEN: Leistungsart[] = [
  {
    label: "Inspektion / Wartung",
    beschreibung: "Inspektion nach Herstellervorgabe inkl. Öl- und Filterwechsel.",
    basis: { min: 249, max: 429 },
    dauer: "ca. 2–3 Stunden",
  },
  {
    label: "Ölwechsel",
    beschreibung: "Motoröl und Ölfilter wechseln, inkl. Material.",
    basis: { min: 89, max: 159 },
    dauer: "ca. 1 Stunde",
  },
  {
    label: "Reifenwechsel / Einlagerung",
    beschreibung: "Räder umstecken, auswuchten, optional einlagern.",
    basis: { min: 69, max: 139 },
    dauer: "ca. 1 Stunde",
  },
  {
    label: "Hauptuntersuchung (HU/AU)",
    beschreibung: "Vorbereitung und Begleitung der Hauptuntersuchung.",
    basis: { min: 129, max: 199 },
    dauer: "ca. 1–2 Stunden",
  },
  {
    label: "Bremsen-Service",
    beschreibung: "Bremsbeläge und/oder Bremsscheiben erneuern.",
    basis: { min: 189, max: 449 },
    dauer: "ca. 2–4 Stunden",
  },
  {
    label: "Achsvermessung",
    beschreibung: "Achsen vermessen und einstellen (z. B. nach Bordsteinkontakt).",
    basis: { min: 99, max: 169 },
    dauer: "ca. 1–2 Stunden",
  },
  {
    label: "Fehlersuche / Diagnose",
    beschreibung: "Fehlerspeicher auslesen und Ursache eingrenzen.",
    basis: { min: 79, max: 159 },
    dauer: "ca. 1 Stunde",
  },
  {
    label: "Klimaservice",
    beschreibung: "Klimaanlage prüfen, Dichtigkeit testen, Kältemittel auffüllen.",
    basis: { min: 99, max: 189 },
    dauer: "ca. 1–2 Stunden",
  },
  {
    label: "Steinschlag / Scheibenreparatur",
    beschreibung: "Steinschlag ausbessern oder Scheibe tauschen lassen.",
    basis: { min: 89, max: 289 },
    dauer: "ca. 1–2 Stunden",
  },
  {
    label: "Unfallschaden / Karosserie",
    beschreibung: "Schaden begutachten; Karosserie- und Lackarbeiten nach Aufwand.",
    basis: { min: 350, max: 1200 },
    dauer: "nach Begutachtung",
  },
  {
    label: "Sonstiges Anliegen",
    beschreibung: "Etwas anderes — wir melden uns mit einer Einschätzung.",
    basis: { min: 80, max: 220 },
    dauer: "nach Rückfrage",
  },
];

/** Der Leistungstext, der zur Anzeige und Speicherung verwendet wird. */
export function istBekannteLeistung(label: string): boolean {
  return LEISTUNGSARTEN.some((leistung) => leistung.label === label);
}

export function leistungNachLabel(label: string): Leistungsart | undefined {
  return LEISTUNGSARTEN.find((leistung) => leistung.label === label);
}
