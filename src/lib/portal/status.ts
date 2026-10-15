/**
 * Statuslogik der Kundenanfrage in verständlichem Deutsch.
 *
 * Reine Funktionen ohne Datenbank- oder Netzwerkzugriff
 * (tests/portal/status.test.ts). Die Statuswerte sind exakt die Werte aus
 * `public.requests.status` (Migration 20260101000000, constraint
 * requests_status_check) — Baustein 3 (Dashboard) zeigt dieselben Status an.
 */

export const ANFRAGE_STATUS = [
  "neu",
  "bestaetigt",
  "abgelehnt",
  "abgeschlossen",
  "storniert",
] as const;

export type AnfrageStatus = (typeof ANFRAGE_STATUS)[number];

/** Unbekannte oder fehlende Statuswerte werden als "neu" behandelt. */
export function normalisiereStatus(wert: unknown): AnfrageStatus {
  const geputzt = typeof wert === "string" ? wert.trim().toLowerCase() : "";
  return (ANFRAGE_STATUS as readonly string[]).includes(geputzt)
    ? (geputzt as AnfrageStatus)
    : "neu";
}

/** Badge-Variante aus src/components/ui/badge.tsx. */
export type StatusBadgeVariante =
  | "neu"
  | "bestaetigt"
  | "abgelehnt"
  | "abgeschlossen"
  | "storniert";

/** Der Statuswert ist zugleich der Name der Badge-Variante. */
export function statusBadge(status: unknown): StatusBadgeVariante {
  return normalisiereStatus(status);
}

export type StatusBeschreibung = {
  /** Kurze Überschrift für den Kunden. */
  titel: string;
  /** Ein Satz für die Statuszeile ("Ihr Termin ist bestätigt."). */
  kurz: string;
  /** Ausführlicher Text: was bedeutet dieser Stand. */
  nachricht: string;
  /** Die nächsten Schritte — konkrete Handlungsanweisungen. */
  naechsteSchritte: string[];
};

/**
 * Texte je Status. `werkstattName` wird eingesetzt, damit der Kunde weiß,
 * mit wem er es zu tun hat.
 */
export const STATUS_TEXTE: Record<AnfrageStatus, StatusBeschreibung> = {
  neu: {
    titel: "Anfrage eingegangen",
    kurz: "Ihre Anfrage liegt bei der Werkstatt.",
    nachricht:
      "Wir haben Ihre Anfrage erhalten. Die Werkstatt prüft Ihren Wunschtermin und Ihre Angaben und meldet sich mit der Bestätigung oder einem Alternativvorschlag. Der Status auf dieser Seite ändert sich, sobald entschieden wurde.",
    naechsteSchritte: [
      "Die Werkstatt prüft Ihren Wunschtermin und schaut, ob das Fahrzeug in der Werkstatt Platz hat.",
      "Sie erhalten eine Rückmeldung mit der Bestätigung oder einem Alternativtermin.",
      "Diese Seite bleibt Ihr Stand — speichern Sie den Link ab oder laden Sie sie später erneut.",
    ],
  },
  bestaetigt: {
    titel: "Termin bestätigt",
    kurz: "Ihr Termin steht fest.",
    nachricht:
      "Die Werkstatt hat Ihre Anfrage angenommen und den Termin fest eingeplant. Bitte kommen Sie zum bestätigten Termin; falls etwas dazwischenkommt, sagen Sie rechtzeitig ab, damit der Platz frei wird.",
    naechsteSchritte: [
      "Kommen Sie zum bestätigten Termin in die Werkstatt.",
      "Bringen Sie den Fahrzeugschein und, wenn vorhanden, frühere Rechnungen oder Vorbefunde mit.",
      "Können Sie nicht kommen, rufen Sie die Werkstatt bitte rechtzeitig an.",
    ],
  },
  abgelehnt: {
    titel: "Anfrage konnte nicht angenommen werden",
    kurz: "Die Werkstatt konnte Ihren Wunschtermin nicht einplanen.",
    nachricht:
      "Die Werkstatt kann Ihre Anfrage zu diesem Termin leider nicht annehmen. Das kann an der Auslastung, am Umfang der Arbeit oder an fehlenden Ersatzteilen liegen. Rufen Sie die Werkstatt gern an — telefonisch findet sich meist ein anderer Termin.",
    naechsteSchritte: [
      "Rufen Sie die Werkstatt an, um einen anderen Termin abzustimmen.",
      "Halten Sie bei Bedarf Fahrzeugschein und Kilometerstand bereit.",
      "Sie können auf der Werkstattseite jederzeit eine neue Anfrage stellen.",
    ],
  },
  abgeschlossen: {
    titel: "Auftrag abgeschlossen",
    kurz: "Die Arbeiten sind erledigt.",
    nachricht:
      "Die Arbeiten an Ihrem Fahrzeug sind abgeschlossen und das Fahrzeug ist wieder für Sie da. Bei Rückfragen zu den Arbeiten oder zur Abrechnung wenden Sie sich gern an die Werkstatt.",
    naechsteSchritte: [
      "Prüfen Sie die Rechnung und bewahren Sie sie für Ihre Unterlagen auf.",
      "Haben Sie Fragen zu den Arbeiten, melden Sie sich bei der Werkstatt.",
      "Für die nächste Inspektion können Sie wieder online einen Termin anfragen.",
    ],
  },
  storniert: {
    titel: "Anfrage storniert",
    kurz: "Diese Anfrage ist nicht mehr aktiv.",
    nachricht:
      "Diese Anfrage wurde storniert und der Termin ist wieder frei. Für ein neues Anliegen können Sie auf der Werkstattseite einfach erneut einen Termin anfragen.",
    naechsteSchritte: [
      "Stellen Sie auf der Werkstattseite bei Bedarf eine neue Anfrage.",
      "Oder rufen Sie die Werkstatt direkt an.",
    ],
  },
};

/** Beschreibung zu einem (auch unbekannten) Statuswert. */
export function beschreibeStatus(
  status: unknown,
  optionen?: { werkstattName?: string | null; ablehnungsgrund?: string | null },
): StatusBeschreibung {
  const basis = STATUS_TEXTE[normalisiereStatus(status)];
  const name = optionen?.werkstattName?.trim();
  const grund = optionen?.ablehnungsgrund?.trim();

  let nachricht = basis.nachricht;
  if (name) {
    nachricht = nachricht.replaceAll("Die Werkstatt", name);
  }
  if (basis === STATUS_TEXTE.abgelehnt && grund) {
    nachricht = `Grund aus der Werkstatt: ${grund}\n\n${nachricht}`;
  }

  return { ...basis, nachricht };
}

/** Referenznummer für die Anzeige vereinheitlichen ("wf-2026-0001" → "WF-2026-0001"). */
export function formatiereReferenz(wert: string | null | undefined): string {
  const geputzt = typeof wert === "string" ? wert.trim() : "";
  return geputzt === "" ? "—" : geputzt.toUpperCase();
}

/** "249 € – 429 €" — leer, wenn keine Schätzung vorliegt. */
export function formatierePreisspanne(
  min: number | null | undefined,
  max: number | null | undefined,
): string | null {
  const untere = typeof min === "number" && Number.isFinite(min) ? min : null;
  const obere = typeof max === "number" && Number.isFinite(max) ? max : null;
  if (untere === null && obere === null) return null;
  if (untere === null) return `bis ${obere} €`;
  if (obere === null || obere === untere) return `${untere} €`;
  return `${untere} € – ${obere} €`;
}
