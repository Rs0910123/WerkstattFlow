/**
 * Datums-, Zeit- und Textformatierung für das Kundenportal.
 *
 * Bewusst OHNE `Date`-Zeitzonenmagie: Das Portal rechnet mit naiven
 * Werkstatt-Zeiten im Format "YYYY-MM-DD" bzw. "YYYY-MM-DDTHH:MM". So ist die
 * Logik unabhängig davon, in welcher Zeitzone der Server läuft, und lässt sich
 * ohne Datenbank prüfen (siehe tests/format.test.ts).
 */

const WOCHENTAG_LANG = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
];

const WOCHENTAG_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const MONAT_LANG = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export const WOCHENTAG_NAMEN: Record<number, string> = {
  1: "Montag",
  2: "Dienstag",
  3: "Mittwoch",
  4: "Donnerstag",
  5: "Freitag",
  6: "Samstag",
  7: "Sonntag",
};

/** Ist der Text ein echtes Datum im Format "YYYY-MM-DD"? */
export function istIsoDatum(wert: unknown): wert is string {
  if (typeof wert !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return false;
  const [jahr, monat, tag] = wert.split("-").map(Number);
  if (monat < 1 || monat > 12 || tag < 1 || tag > 31) return false;
  const geprueft = new Date(Date.UTC(jahr, monat - 1, tag));
  return (
    geprueft.getUTCFullYear() === jahr &&
    geprueft.getUTCMonth() === monat - 1 &&
    geprueft.getUTCDate() === tag
  );
}

function zuUtc(isoDatum: string): number {
  const [jahr, monat, tag] = isoDatum.split("-").map(Number);
  return Date.UTC(jahr, monat - 1, tag);
}

function ausUtc(ms: number): string {
  const d = new Date(ms);
  const monat = String(d.getUTCMonth() + 1).padStart(2, "0");
  const tag = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${monat}-${tag}`;
}

/** Wochentag nach ISO-8601: 1 = Montag ... 7 = Sonntag. */
export function wochentagIso(isoDatum: string): number {
  const tag = new Date(zuUtc(isoDatum)).getUTCDay(); // 0 = Sonntag
  return tag === 0 ? 7 : tag;
}

export function datumPlusTage(isoDatum: string, tage: number): string {
  return ausUtc(zuUtc(isoDatum) + tage * 86_400_000);
}

/** Ganze Tage zwischen zwei Daten (b - a). */
export function tageZwischen(a: string, b: string): number {
  return Math.round((zuUtc(b) - zuUtc(a)) / 86_400_000);
}

/** Vergleich für die Sortierung: negativ = a liegt vor b. */
export function vergleicheDatum(a: string, b: string): number {
  return zuUtc(a) - zuUtc(b);
}

export function formatiereDatum(isoDatum: string): string {
  if (!istIsoDatum(isoDatum)) return "—";
  const [jahr, monat, tag] = isoDatum.split("-");
  return `${tag}.${monat}.${jahr}`;
}

/** z. B. "Montag, 12. Oktober 2026" */
export function formatiereDatumLang(isoDatum: string): string {
  if (!istIsoDatum(isoDatum)) return "—";
  const [jahr, monat, tag] = isoDatum.split("-").map(Number);
  return `${WOCHENTAG_LANG[wochentagIso(isoDatum) - 1]}, ${tag}. ${
    MONAT_LANG[monat - 1]
  } ${jahr}`;
}

/** z. B. "Mo, 12.10." — kurz genug für Kalenderkacheln. */
export function formatiereDatumKurz(isoDatum: string): string {
  if (!istIsoDatum(isoDatum)) return "—";
  const [, monat, tag] = isoDatum.split("-");
  return `${WOCHENTAG_KURZ[wochentagIso(isoDatum) - 1]}, ${tag}.${monat}.`;
}

/** z. B. "Oktober 2026" */
export function formatiereMonat(jahr: number, monat: number): string {
  return `${MONAT_LANG[monat - 1]} ${jahr}`;
}

/** Minuten seit Mitternacht als Uhrzeit: 450 -> "07:30" */
export function formatiereMinute(minuten: number): string {
  const sicher = Math.max(0, Math.min(24 * 60, Math.round(minuten)));
  const stunde = String(Math.floor(sicher / 60)).padStart(2, "0");
  const minute = String(sicher % 60).padStart(2, "0");
  return `${stunde}:${minute}`;
}

/** "07:30:00" -> 450 Minuten; ungültige oder leere Werte -> null. */
export function uhrzeitZuMinuten(wert: string | null | undefined): number | null {
  if (typeof wert !== "string") return null;
  const treffer = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(wert.trim());
  if (!treffer) return null;
  const stunde = Number(treffer[1]);
  const minute = Number(treffer[2]);
  if (stunde > 24 || minute > 59) return null;
  return stunde * 60 + minute;
}

/** "08:00–09:00 Uhr" */
export function formatiereSlot(startMinute: number, endMinute: number): string {
  return `${formatiereMinute(startMinute)}–${formatiereMinute(endMinute)} Uhr`;
}

/**
 * Aktuelle Werkstatt-Zeit als naive Zeichenkette "YYYY-MM-DDTHH:MM".
 * Damit rechnet die Kalenderlogik in der Zeit der Werkstatt, egal wo der
 * Server steht (lokal, Vercel in UTC).
 */
export function jetztInZeitzone(zeitzone: string, jetzt: Date = new Date()): string {
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: zeitzone || "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(jetzt);

  const wert = (typ: string) =>
    teile.find((teil) => teil.type === typ)?.value ?? "00";

  return `${wert("year")}-${wert("month")}-${wert("day")}T${wert("hour")}:${wert(
    "minute",
  )}`;
}

/** Minuten zwischen zwei naiven Zeitpunkten ("YYYY-MM-DDTHH:MM"). */
export function minutenZwischen(von: string, bis: string): number {
  const ms = (wert: string) => {
    const treffer = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wert);
    if (!treffer) return Number.NaN;
    return Date.UTC(
      Number(treffer[1]),
      Number(treffer[2]) - 1,
      Number(treffer[3]),
      Number(treffer[4]),
      Number(treffer[5]),
    );
  };
  return Math.round((ms(bis) - ms(von)) / 60_000);
}

/**
 * Zeitstempel aus der Datenbank (ISO mit Zeitzone, z. B. "2026-10-06T12:00:00Z")
 * als deutsche Werkstatt-Zeit: "06.10.2026, 14:00 Uhr".
 */
export function formatiereZeitstempel(
  wert: string | null | undefined,
  zeitzone = "Europe/Berlin",
): string {
  if (!wert) return "—";
  const datum = new Date(wert);
  if (Number.isNaN(datum.getTime())) return "—";
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: zeitzone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(datum);
  const wert_ = (typ: string) =>
    teile.find((teil) => teil.type === typ)?.value ?? "00";
  return `${wert_("day")}.${wert_("month")}.${wert_("year")}, ${wert_(
    "hour",
  )}:${wert_("minute")} Uhr`;
}

/** Naive Werkstatt-Zeit ("2026-10-06T08:00:00") als "06.10.2026, 08:00 Uhr". */
export function formatiereNaiveZeit(wert: string | null | undefined): string {
  if (!wert) return "—";
  const treffer = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(wert);
  if (!treffer) return "—";
  return `${treffer[3]}.${treffer[2]}.${treffer[1]}, ${treffer[4]}:${treffer[5]} Uhr`;
}
