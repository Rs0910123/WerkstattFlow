/**
 * Fachliche Logik des Werkstatt-Dashboards (Baustein 3, Teil A).
 *
 * Diese Datei enthält AUSSCHLIESSLICH reine Funktionen: keine Datenbank, kein
 * Netzwerk, kein `server-only`. Damit sind Statusübergänge, Filter, Sortierung,
 * Kennzahlen und die Termin-Vorprüfung direkt testbar
 * (tests/dashboard/anfragen.test.ts).
 *
 * Verbindlich bleibt trotzdem die Datenbank: die dortigen Funktionen
 * (confirm_request / reject_request / set_request_status, Migration
 * 20260101000500) entscheiden am Ende. Die Funktionen hier sind die zweite,
 * schnelle Prüfung in der Oberfläche — sie geben deutsche Meldungen aus, statt
 * den Benutzer auf einen Datenbankfehler laufen zu lassen.
 */

// Bewusst relativ (nicht über "@/..."), damit die Datei auch unter
// `node --test` ohne Pfad-Alias-Support direkt ladbar ist.
import { STATUS_BESCHRIFTUNG, type AnfrageStatus } from "../../types/database";

/* -------------------------------------------------------------------------- */
/* Filter und Sortierung                                                      */
/* -------------------------------------------------------------------------- */

/** Filter der Inbox: "alle" oder ein konkreter Status. */
export type StatusFilter = "alle" | AnfrageStatus;

export const STATUS_FILTER: readonly { wert: StatusFilter; label: string }[] = [
  { wert: "alle", label: "Alle" },
  { wert: "neu", label: "Neu" },
  { wert: "bestaetigt", label: "Bestätigt" },
  { wert: "abgelehnt", label: "Abgelehnt" },
  { wert: "abgeschlossen", label: "Abgeschlossen" },
  { wert: "storniert", label: "Storniert" },
] as const;

export type SortierRichtung = "neueste" | "aelteste";

export const SORTIER_RICHTUNGEN: readonly {
  wert: SortierRichtung;
  label: string;
}[] = [
  { wert: "neueste", label: "Neueste zuerst" },
  { wert: "aelteste", label: "Älteste zuerst" },
] as const;

/** Unbekannte Werte aus der Adresszeile fallen auf den Standard zurück. */
export function normalisiereStatusFilter(wert: unknown): StatusFilter {
  const geputzt = typeof wert === "string" ? wert.trim().toLowerCase() : "";
  return STATUS_FILTER.some((eintrag) => eintrag.wert === geputzt)
    ? (geputzt as StatusFilter)
    : "alle";
}

export function normalisiereSortierung(wert: unknown): SortierRichtung {
  const geputzt = typeof wert === "string" ? wert.trim().toLowerCase() : "";
  return SORTIER_RICHTUNGEN.some((eintrag) => eintrag.wert === geputzt)
    ? (geputzt as SortierRichtung)
    : "neueste";
}

type MitStatus = { status: AnfrageStatus };
type MitEingang = { created_at: string };

/** Anfragen nach Status filtern. "alle" lässt alles durch. */
export function filtereAnfragen<T extends MitStatus>(
  anfragen: readonly T[],
  filter: StatusFilter,
): T[] {
  if (filter === "alle") return [...anfragen];
  return anfragen.filter((anfrage) => anfrage.status === filter);
}

/** Anfragen nach Eingangszeitpunkt sortieren (Eingang = created_at). */
export function sortiereAnfragen<T extends MitEingang>(
  anfragen: readonly T[],
  richtung: SortierRichtung = "neueste",
): T[] {
  const faktor = richtung === "neueste" ? -1 : 1;
  return [...anfragen].sort((a, b) => {
    const zeitA = zeitwert(a.created_at);
    const zeitB = zeitwert(b.created_at);
    // Ohne gültigen Zeitstempel bleibt die Reihenfolge stabil.
    return (zeitA - zeitB) * faktor;
  });
}

function zeitwert(wert: string): number {
  const zeit = new Date(wert).getTime();
  return Number.isNaN(zeit) ? 0 : zeit;
}

/* -------------------------------------------------------------------------- */
/* Kennzahlen                                                                 */
/* -------------------------------------------------------------------------- */

export type Kennzahlen = {
  gesamt: number;
  offen: number;
  bestaetigt: number;
  abgelehnt: number;
  abgeschlossen: number;
  storniert: number;
};

/** Kennzahlen für Kopf und Startseite des Dashboards. */
export function berechneKennzahlen(anfragen: readonly MitStatus[]): Kennzahlen {
  const zaehler: Kennzahlen = {
    gesamt: anfragen.length,
    offen: 0,
    bestaetigt: 0,
    abgelehnt: 0,
    abgeschlossen: 0,
    storniert: 0,
  };

  for (const anfrage of anfragen) {
    switch (anfrage.status) {
      case "neu":
        zaehler.offen += 1;
        break;
      case "bestaetigt":
        zaehler.bestaetigt += 1;
        break;
      case "abgelehnt":
        zaehler.abgelehnt += 1;
        break;
      case "abgeschlossen":
        zaehler.abgeschlossen += 1;
        break;
      case "storniert":
        zaehler.storniert += 1;
        break;
    }
  }

  return zaehler;
}

/* -------------------------------------------------------------------------- */
/* Statusübergänge                                                            */
/* -------------------------------------------------------------------------- */

export type VorgangAktion = "bestaetigen" | "ablehnen" | "abschliessen" | "stornieren";

/** Zielstatus je Aktion. */
export const AKTION_ZIELSTATUS: Record<VorgangAktion, AnfrageStatus> = {
  bestaetigen: "bestaetigt",
  ablehnen: "abgelehnt",
  abschliessen: "abgeschlossen",
  stornieren: "storniert",
};

export const AKTION_BESCHRIFTUNG: Record<VorgangAktion, string> = {
  bestaetigen: "Termin bestätigen",
  ablehnen: "Anfrage ablehnen",
  abschliessen: "Als abgeschlossen markieren",
  stornieren: "Auftrag stornieren",
};

/**
 * Fachlich erlaubte Statusübergänge (Spiegel der Prüfungen in der Datenbank):
 *
 *   neu        -> bestaetigt (nur mit Termin) | abgelehnt (nur mit Grund) | storniert
 *   bestaetigt -> abgeschlossen | storniert
 *   abgelehnt, abgeschlossen, storniert -> keine Änderung mehr
 */
export const ERLAUBTE_UEBERGAENGE: Record<AnfrageStatus, readonly AnfrageStatus[]> = {
  neu: ["bestaetigt", "abgelehnt", "storniert"],
  bestaetigt: ["abgeschlossen", "storniert"],
  abgelehnt: [],
  abgeschlossen: [],
  storniert: [],
};

export type UebergangsPruefung = {
  erlaubt: boolean;
  /** Deutsche Meldung, wenn der Übergang nicht erlaubt ist. */
  meldung: string | null;
};

/** Ist ein Statuswechsel erlaubt? Liefert bei Ablehnung eine klare Meldung. */
export function pruefeUebergang(
  von: unknown,
  nach: AnfrageStatus,
): UebergangsPruefung {
  const aktuell = normalisiereAnfrageStatus(von);

  if (aktuell === nach) {
    return {
      erlaubt: false,
      meldung: `Die Anfrage ist bereits „${STATUS_BESCHRIFTUNG[nach]}“ — es gibt nichts zu ändern.`,
    };
  }

  if (ERLAUBTE_UEBERGAENGE[aktuell].includes(nach)) {
    return { erlaubt: true, meldung: null };
  }

  return {
    erlaubt: false,
    meldung: `Eine Anfrage im Status „${STATUS_BESCHRIFTUNG[aktuell]}“ kann nicht auf „${STATUS_BESCHRIFTUNG[nach]}“ gesetzt werden. Bitte laden Sie die Seite neu — sie zeigt dann den aktuellen Stand.`,
  };
}

/**
 * Welche Aktionen bietet die Oberfläche in diesem Status an?
 * Nur "neu" ist entscheidbar — deshalb stehen Bestätigen/Ablehnen nur dort.
 * Abschließen und Stornieren sind nur bei laufenden Aufträgen sinnvoll.
 */
export function verfuegbareAktionen(status: unknown): VorgangAktion[] {
  const aktuell = normalisiereAnfrageStatus(status);
  const aktionen: VorgangAktion[] = [];

  if (ERLAUBTE_UEBERGAENGE[aktuell].includes("bestaetigt")) aktionen.push("bestaetigen");
  if (ERLAUBTE_UEBERGAENGE[aktuell].includes("abgelehnt")) aktionen.push("ablehnen");
  if (ERLAUBTE_UEBERGAENGE[aktuell].includes("abgeschlossen")) aktionen.push("abschliessen");
  if (ERLAUBTE_UEBERGAENGE[aktuell].includes("storniert")) aktionen.push("stornieren");

  return aktionen;
}

/** Kurzhinweis zur Lage der Anfrage (Kopf der Detailansicht). */
export const STATUS_HINWEIS: Record<AnfrageStatus, string> = {
  neu: "Diese Anfrage wartet auf eine Entscheidung: Termin bestätigen oder ablehnen.",
  bestaetigt:
    "Der Termin ist vergeben und steht im Kalender. Nach der Durchführung können Sie den Auftrag abschließen.",
  abgelehnt:
    "Die Anfrage wurde abgelehnt. Der Kunde sieht auf seiner Statusseite den angegebenen Grund.",
  abgeschlossen: "Der Auftrag ist abgeschlossen und in der Anfragenliste archiviert.",
  storniert: "Der Auftrag wurde storniert; der Termin ist wieder frei.",
};

/** Statuswerte tolerant in einen bekannten Wert überführen ("neu" als Rückfall). */
export function normalisiereAnfrageStatus(wert: unknown): AnfrageStatus {
  const geputzt = typeof wert === "string" ? wert.trim().toLowerCase() : "";
  return (["neu", "bestaetigt", "abgelehnt", "abgeschlossen", "storniert"] as const).includes(
    geputzt as AnfrageStatus,
  )
    ? (geputzt as AnfrageStatus)
    : "neu";
}

/* -------------------------------------------------------------------------- */
/* Terminprüfung (Bestätigen-Dialog)                                          */
/* -------------------------------------------------------------------------- */

/** Mindest- und Höchstdauer eines Termins (Spiegel der Datenbank-Grenzen). */
export const MINUTEN_MIN = 15;
export const MINUTEN_MAX = 480;

/** Terminstatus, die einen Slot belegen (Spiegel von confirm_request). */
export const KOLLISIONS_STATUS: readonly string[] = [
  "geplant",
  "bestaetigt",
  "abgeschlossen",
];

export type TerminZeitfenster = {
  starts_at: string;
  ends_at: string;
  title?: string | null;
  status?: string | null;
};

export type UhrTeile = { datum: string; minute: number };

const TEIL_FORMATIERER = new Map<string, Intl.DateTimeFormat>();

function teilFormatierer(zeitzone: string): Intl.DateTimeFormat {
  const vorhanden = TEIL_FORMATIERER.get(zeitzone);
  if (vorhanden) return vorhanden;
  const neu = new Intl.DateTimeFormat("de-DE", {
    timeZone: zeitzone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  TEIL_FORMATIERER.set(zeitzone, neu);
  return neu;
}

/**
 * Wie spät ist es an diesem Zeitstempel in der Werkstatt-Zeitzone?
 * Liefert das Kalenderdatum (YYYY-MM-DD) und die Minute des Tages (0-1439).
 *
 * Damit vergleicht die Oberfläche Termine in derselben "Wanduhr" wie die
 * Datenbank (dort: `at time zone companies.timezone`) — ohne selbst mit
 * Sommer-/Winterzeit hantieren zu müssen.
 */
export function lokaleTeile(
  zeitpunkt: string | Date | null | undefined,
  zeitzone: string,
): UhrTeile | null {
  if (!zeitpunkt) return null;
  const datum = typeof zeitpunkt === "string" ? new Date(zeitpunkt) : zeitpunkt;
  if (Number.isNaN(datum.getTime())) return null;

  let zone = zeitzone;
  try {
    teilFormatierer(zone).format(datum);
  } catch {
    zone = "Europe/Berlin";
  }

  const teile = teilFormatierer(zone).formatToParts(datum);
  const wert = (typ: string) =>
    teile.find((teil) => teil.type === typ)?.value ?? "";

  const tag = wert("day");
  const monat = wert("month");
  const jahr = wert("year");
  // 24:00 Uhr wird von Intl je nach Umgebung als "24" ausgegeben.
  const stunde = Number(wert("hour")) % 24;
  const minute = Number(wert("minute"));

  if (!tag || !monat || !jahr || Number.isNaN(stunde) || Number.isNaN(minute)) {
    return null;
  }

  return {
    datum: `${jahr}-${monat}-${tag}`,
    minute: stunde * 60 + minute,
  };
}

/** "09:30" → 570 Minuten seit Mitternacht. Null bei ungültiger Eingabe. */
export function uhrzeitZuMinuten(wert: string | null | undefined): number | null {
  if (typeof wert !== "string") return null;
  const treffer = /^(\d{1,2}):(\d{2})$/.exec(wert.trim());
  if (!treffer) return null;
  const stunden = Number(treffer[1]);
  const minuten = Number(treffer[2]);
  if (stunden > 23 || minuten > 59) return null;
  return stunden * 60 + minuten;
}

/** 570 → "09:30" */
export function minutenZuUhrzeit(minuten: number): string {
  const sicher = Math.max(0, Math.min(1439, Math.round(minuten)));
  const stunden = Math.floor(sicher / 60);
  return `${String(stunden).padStart(2, "0")}:${String(sicher % 60).padStart(2, "0")}`;
}

/** Alle Termine, die an diesem Kalendertag (Wanduhr der Werkstatt) liegen. */
export function termineAmTag(
  termine: readonly TerminZeitfenster[],
  datum: string,
  zeitzone: string,
): { startMinute: number; endMinute: number; title: string | null }[] {
  const ergebnis: { startMinute: number; endMinute: number; title: string | null }[] = [];

  for (const termin of termine) {
    if (termin.status && !KOLLISIONS_STATUS.includes(termin.status)) continue;
    const start = lokaleTeile(termin.starts_at, zeitzone);
    const ende = lokaleTeile(termin.ends_at, zeitzone);
    if (!start || !ende || start.datum !== datum) continue;
    ergebnis.push({
      startMinute: start.minute,
      // Endet der Termin am Folgetag, zählt er bis Mitternacht.
      endMinute: ende.datum === start.datum ? ende.minute : 1440,
      title: termin.title ?? null,
    });
  }

  return ergebnis.sort((a, b) => a.startMinute - b.startMinute);
}

export type TerminEingabePruefung =
  | { ok: true }
  | { ok: false; meldung: string };

/**
 * Vorprüfung des Bestätigen-Dialogs: Datum, Uhrzeit, Dauer und Kollision.
 * Die Datenbank prüft danach erneut und endgültig (confirm_request).
 */
export function pruefeTerminEingabe({
  datum,
  uhrzeit,
  dauerMinuten,
  termine,
  zeitzone,
  heute,
}: {
  datum: string | null | undefined;
  uhrzeit: string | null | undefined;
  dauerMinuten: number;
  termine: readonly TerminZeitfenster[];
  zeitzone: string;
  /** "Heute" in der Werkstatt-Zeitzone (YYYY-MM-DD). Ohne Angabe keine Prüfung. */
  heute?: string | null;
}): TerminEingabePruefung {
  if (!istIsoDatum(datum)) {
    return { ok: false, meldung: "Bitte wählen Sie ein Datum für den Termin." };
  }

  const startMinute = uhrzeitZuMinuten(uhrzeit);
  if (startMinute === null) {
    return { ok: false, meldung: "Bitte geben Sie eine Uhrzeit im Format HH:MM an." };
  }

  if (
    !Number.isFinite(dauerMinuten) ||
    dauerMinuten < MINUTEN_MIN ||
    dauerMinuten > MINUTEN_MAX
  ) {
    return {
      ok: false,
      meldung: `Die Dauer muss zwischen ${MINUTEN_MIN} und ${MINUTEN_MAX} Minuten liegen.`,
    };
  }

  const endeMinute = startMinute + dauerMinuten;
  if (endeMinute > 1440) {
    return {
      ok: false,
      meldung: "Der Termin reicht über Mitternacht hinaus. Bitte wählen Sie eine frühere Uhrzeit.",
    };
  }

  if (heute && datum < heute) {
    return {
      ok: false,
      meldung: "Der Termin liegt in der Vergangenheit. Bitte wählen Sie ein Datum ab heute.",
    };
  }

  const belegt = termineAmTag(termine, datum, zeitzone).find(
    (vorhanden) =>
      vorhanden.startMinute < endeMinute && vorhanden.endMinute > startMinute,
  );

  if (belegt) {
    return {
      ok: false,
      meldung: `Zu dieser Zeit ist bereits ein Termin eingetragen (${minutenZuUhrzeit(
        belegt.startMinute,
      )}–${minutenZuUhrzeit(belegt.endMinute)} Uhr${
        belegt.title ? `: ${belegt.title}` : ""
      }). Bitte wählen Sie einen anderen Termin.`,
    };
  }

  return { ok: true };
}

/** Strenges Prüfen auf "YYYY-MM-DD". */
export function istIsoDatum(wert: unknown): wert is string {
  if (typeof wert !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wert)) return false;
  const datum = new Date(`${wert}T00:00:00Z`);
  return !Number.isNaN(datum.getTime()) && datum.toISOString().slice(0, 10) === wert;
}

/* -------------------------------------------------------------------------- */
/* Anzeige-Aufbereitung                                                       */
/* -------------------------------------------------------------------------- */

export const KONTAKTART_BESCHRIFTUNG: Record<string, string> = {
  email: "E-Mail",
  telefon: "Telefonanruf",
  sms: "SMS",
};

export const QUELLE_BESCHRIFTUNG: Record<string, string> = {
  online: "Online-Formular (Kundenportal)",
  telefon: "Telefonisch aufgenommen",
  vor_ort: "Vor Ort aufgenommen",
  sms_webhook: "Telefonanruf mit SMS-Link",
};

/** Freitext der Kontaktwünsche ("Rückruf bitte vormittags"). */
export function beschreibeKontaktart(wert: unknown): string {
  const schluessel = typeof wert === "string" ? wert.trim().toLowerCase() : "";
  return KONTAKTART_BESCHRIFTUNG[schluessel] ?? "Keine Angabe";
}

export function beschreibeQuelle(wert: unknown): string {
  const schluessel = typeof wert === "string" ? wert.trim().toLowerCase() : "";
  return QUELLE_BESCHRIFTUNG[schluessel] ?? "Unbekannter Weg";
}

/** "05.10.2026" — Datum aus der Datenbank, ohne Uhrzeit. */
export function formatiereTag(wert: string | null | undefined): string {
  if (!wert) return "—";
  const datum = new Date(`${wert}T12:00:00Z`);
  if (Number.isNaN(datum.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(datum);
}

/**
 * Wunschtermin des Kunden in einem Satz: "05.10.2026 – 12.10.2026, am liebsten
 * morgens ab 8 Uhr". Fehlende Teile werden weggelassen.
 */
export function formatiereWunschtermin(
  von: string | null | undefined,
  bis: string | null | undefined,
  notiz?: string | null,
): string {
  const teile: string[] = [];

  if (von && bis && von !== bis) {
    teile.push(`${formatiereTag(von)} – ${formatiereTag(bis)}`);
  } else if (von || bis) {
    teile.push(formatiereTag(von ?? bis));
  }

  const zusatz = typeof notiz === "string" ? notiz.trim() : "";
  if (zusatz) teile.push(zusatz);

  return teile.length > 0 ? teile.join(" · ") : "Kein Wunschtermin angegeben";
}

/** "289,00 € – 420,00 €" bzw. Hinweis, wenn keine Schätzung vorliegt. */
export function formatierePreisspanne(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
): string {
  const untere = zahl(min);
  const obere = zahl(max);
  if (untere === null && obere === null) return "Keine Schätzung vorhanden";
  if (untere === null) return `bis ${euro(obere as number)}`;
  if (obere === null || obere === untere) return euro(untere);
  return `${euro(untere)} – ${euro(obere)}`;
}

function zahl(wert: number | string | null | undefined): number | null {
  if (wert === null || wert === undefined || wert === "") return null;
  const umgewandelt = typeof wert === "string" ? Number(wert) : wert;
  return Number.isFinite(umgewandelt) ? umgewandelt : null;
}

function euro(wert: number): string {
  return `${new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(wert)} €`;
}

/**
 * Zeitspanne zwischen Eingang und jetzt, grob in Worten — für die Inbox
 * ("vor 4 Stunden"), damit die Werkstatt auf einen Blick die Dringlichkeit sieht.
 */
export function beschreibeEingang(
  eingang: string | null | undefined,
  jetzt: Date = new Date(),
): string {
  if (!eingang) return "Zeitpunkt unbekannt";
  const zeit = new Date(eingang).getTime();
  if (Number.isNaN(zeit)) return "Zeitpunkt unbekannt";

  const minuten = Math.floor((jetzt.getTime() - zeit) / 60000);
  if (minuten < 1) return "gerade eben";
  if (minuten < 60) return `vor ${minuten} Minute${minuten === 1 ? "" : "n"}`;

  const stunden = Math.floor(minuten / 60);
  if (stunden < 24) return `vor ${stunden} Stunde${stunden === 1 ? "" : "n"}`;

  const tage = Math.floor(stunden / 24);
  if (tage < 31) return `vor ${tage} Tag${tage === 1 ? "" : "en"}`;

  const monate = Math.floor(tage / 30.5);
  return `vor ${monate} Monat${monate === 1 ? "" : "en"}`;
}
