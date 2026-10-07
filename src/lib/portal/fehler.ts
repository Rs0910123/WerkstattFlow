/**
 * Übersetzung technischer Fehlerkennungen in verständliches Deutsch.
 *
 * Die Datenbankfunktion public.create_public_request meldet Fehler mit kurzen
 * Kennungen (z. B. 'zu_schnell'). Der Kunde soll niemals eine technische
 * Meldung sehen. Reine Funktion, ohne Datenbank prüfbar
 * (tests/portal-basics.test.ts).
 */

export const FEHLER_TEXTE: Record<string, string> = {
  werkstatt_unbekannt:
    "Diese Werkstatt ist nicht bekannt oder nimmt derzeit keine Online-Anfragen an.",
  eingabe_ungueltig:
    "Ihre Angaben sind unvollständig oder enthalten ein ungültiges Format. Bitte prüfen Sie die markierten Felder.",
  zu_schnell:
    "Ihre Anfrage wurde gerade eben schon übermittelt. Bitte warten Sie eine Minute und versuchen Sie es dann erneut.",
  zu_viele_anfragen:
    "Es sind bereits mehrere Anfragen von Ihnen offen. Bitte rufen Sie die Werkstatt direkt an, damit Ihr Anliegen nicht liegen bleibt.",
};

export const FEHLER_STANDARD =
  "Die Anfrage konnte gerade nicht übermittelt werden. Bitte versuchen Sie es erneut oder rufen Sie die Werkstatt an.";

/** Kennung aus einer Datenbankmeldung herausziehen und übersetzen. */
export function uebersetzeDbFehler(meldung: string | null | undefined): string {
  if (typeof meldung !== "string") return FEHLER_STANDARD;
  for (const [kennung, text] of Object.entries(FEHLER_TEXTE)) {
    if (meldung.includes(kennung)) return text;
  }
  return FEHLER_STANDARD;
}
