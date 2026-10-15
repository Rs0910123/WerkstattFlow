/**
 * Format und Umgang mit dem öffentlichen Anfrage-Token.
 *
 * Der Token ist ein zufälliger UUID-Wert aus der Datenbank (public_token). Er
 * ist der EINZIGE Zugang zur Statusseite des Kunden — deshalb prüfen wir das
 * Format streng, bevor überhaupt eine Datenbankabfrage ausgelöst wird.
 * Reine Funktion (tests/portal-basics.test.ts).
 */

export const TOKEN_MUSTER =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function istGueltigerToken(wert: unknown): wert is string {
  return typeof wert === "string" && TOKEN_MUSTER.test(wert);
}

/** Token aus einer URL bereinigen; gibt null zurück, wenn er nicht passt. */
export function normalisiereToken(wert: unknown): string | null {
  if (typeof wert !== "string") return null;
  const geputzt = wert.trim().toLowerCase();
  return istGueltigerToken(geputzt) ? geputzt : null;
}

/** Vollständige Statusadresse — Baustein 4 verschickt genau diesen Link. */
export function statusLink(token: string, basisUrl: string): string {
  const basis = basisUrl.replace(/\/+$/, "");
  return `${basis}/status/${token}`;
}

/** Öffentlicher Werkstattlink (Ziel des QR-Codes in Baustein 3). */
export function werkstattLink(slug: string, basisUrl: string): string {
  const basis = basisUrl.replace(/\/+$/, "");
  return `${basis}/w/${slug}`;
}
