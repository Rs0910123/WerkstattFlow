/**
 * Adresse des Kundenportals einer Werkstatt (/w/<slug>) und der Basis-URL-Aufbau
 * für den QR-Download.
 *
 * Reine Funktionen: geprüft in tests/dashboard/kalender.test.ts.
 */

import { siteUrl } from "../env.ts";

/** Basis-Adresse der laufenden Instanz aus den Kopfzeilen der Anfrage. */
export function basisAusKopfzeilen(
  host: string | null,
  protokoll: string | null,
  vorgabe: string = siteUrl,
): string {
  const saubererHost = (host ?? "").trim().replace(/\/+$/, "");
  if (saubererHost === "") return ohneSchraegstrich(vorgabe);
  const schema = (protokoll ?? "https").trim().toLowerCase() === "http" ? "http" : "https";
  return `${schema}://${saubererHost}`;
}

/** Vollständiger Kundenlink einer Werkstatt, z. B. https://…/w/kfz-werkstatt-berger */
export function kundenlinkUrl(slug: string, basis: string = siteUrl): string {
  const saubererSlug = (slug ?? "").trim().replace(/^\/+|\/+$/g, "");
  const wurzel = ohneSchraegstrich(basis);
  return saubererSlug === "" ? `${wurzel}/w` : `${wurzel}/w/${saubererSlug}`;
}

function ohneSchraegstrich(wert: string): string {
  const sauber = (wert ?? "").trim().replace(/\/+$/, "");
  return sauber === "" ? "http://localhost:3000" : sauber;
}
