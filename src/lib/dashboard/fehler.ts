/**
 * Übersetzung der Datenbank-Fehlerkennungen aus den Dashboard-Funktionen
 * (Migration 20260101000500) in verständliches Deutsch.
 *
 * Reine Funktion ohne Datenbank- oder Netzwerkzugriff — deshalb direkt testbar
 * (tests/dashboard/fehler.test.ts).
 */

/** Kennung → deutscher Text. Die Kennungen stammen aus `raise exception`. */
export const DASHBOARD_FEHLER: Record<string, string> = {
  anfrage_unbekannt:
    "Diese Anfrage wurde nicht gefunden oder gehört nicht zu Ihrer Werkstatt. Bitte laden Sie die Seite neu.",
  status_ungueltig:
    "Die Anfrage wurde inzwischen bearbeitet — dieser Schritt ist nicht mehr möglich. Die Seite zeigt jetzt den aktuellen Stand.",
  termin_kollision:
    "Zu dieser Zeit ist in Ihrer Werkstatt bereits ein Termin eingetragen. Bitte wählen Sie einen anderen Zeitpunkt.",
  termin_ungueltig:
    "Bitte geben Sie Datum und Uhrzeit des Termins an (Uhrzeit im Format HH:MM).",
  begruendung_fehlt:
    "Bitte geben Sie eine Begründung an — der Kunde sieht sie auf seiner Statusseite.",
  eingabe_ungueltig:
    "Die Angaben sind unvollständig oder haben ein ungültiges Format. Bitte prüfen Sie Ihre Eingaben.",
};

export const DASHBOARD_FEHLER_STANDARD =
  "Die Aktion konnte nicht ausgeführt werden. Bitte versuchen Sie es erneut; bleibt es dabei, laden Sie die Seite neu.";

/** Fehlerkennungen aus einer beliebigen Fehlerquelle herausziehen. */
function fehlertext(fehler: unknown): string {
  if (fehler === null || fehler === undefined) return "";
  if (typeof fehler === "string") return fehler;
  if (fehler instanceof Error) return fehler.message;
  if (typeof fehler === "object" && "message" in fehler) {
    const meldung = (fehler as { message?: unknown }).message;
    if (typeof meldung === "string") return meldung;
  }
  return "";
}

/**
 * Übersetzt einen Fehler aus der Datenbank in eine deutsche Meldung.
 *
 * Erkannt werden unsere eigenen Kennungen (oben) sowie die RLS-Abweisung von
 * Postgres — sie darf in der Oberfläche nie als englischer Datenbanktext
 * auftauchen.
 */
export function uebersetzeDashboardFehler(fehler: unknown): string {
  const text = fehlertext(fehler);
  if (text === "") return DASHBOARD_FEHLER_STANDARD;

  const klein = text.toLowerCase();

  for (const [kennung, meldung] of Object.entries(DASHBOARD_FEHLER)) {
    if (klein.includes(kennung)) return meldung;
  }

  if (klein.includes("row-level security") || klein.includes("permission denied")) {
    return "Diese Anfrage gehört nicht zu Ihrer Werkstatt. Zugriff verweigert.";
  }
  if (klein.includes("duplicate key")) {
    return "Für diese Anfrage gibt es bereits einen Termin. Bitte laden Sie die Seite neu.";
  }

  return DASHBOARD_FEHLER_STANDARD;
}

/** Ist der Fehler eine RLS-Abweisung? (Für Prüfungen und Berichte.) */
export function istRlsAbweisung(fehler: unknown): boolean {
  const klein = fehlertext(fehler).toLowerCase();
  return klein.includes("row-level security") || klein.includes("permission denied");
}
