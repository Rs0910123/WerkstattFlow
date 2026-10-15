"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/env";
import { formDataZuObjekt } from "@/lib/portal/anfrage-schema.ts";
import { verarbeiteAnfrage } from "@/lib/portal/anfrage.ts";
import { ladeOeffentlicheWerkstatt, sendeOeffentlicheAnfrage } from "@/lib/portal/daten.ts";
import { jetztInZeitzone } from "@/lib/portal/format.ts";
import { clientKennung, erstelleRatenbegrenzer } from "@/lib/portal/rate-limit.ts";
import { statusLink } from "@/lib/portal/token.ts";

/**
 * Server Action des öffentlichen Anfrageformulars (Baustein 2, Teil B).
 *
 * Sie ist der einzige Weg, auf dem ein nicht angemeldeter Besucher etwas
 * schreiben kann. Der Ablauf selbst liegt prüfbar in src/lib/portal/anfrage.ts;
 * hier werden nur die echten Abhängigkeiten hineingereicht:
 *   - die Kopfzeilen des Aufrufers (nur für die Ratenbegrenzung),
 *   - der Ratenbegrenzer dieser Serverinstanz,
 *   - der Datenbankzugriff über public.create_public_request (daten.ts).
 *
 * Der Werkstatt-Slug und die Zeitzone kommen aus dem Formular, werden aber
 * serverseitig gegen die öffentliche Werkstatt geprüft — ein gefälschter Slug
 * führt zu einer Datenbankmeldung (werkstatt_unbekannt) und nicht zu einer
 * Anfrage bei einer anderen Werkstatt.
 *
 * Nach Erfolg wird auf die Statusseite umgeleitet. Der Versand der
 * Bestätigungs-E-Mail folgt in Baustein 4 — hier ist bewusst noch kein
 * E-Mail-Aufruf, aber der Platz dafür (siehe Kommentar unten).
 */

/** Zustand für das Formular: deutsche Fehler und die erhaltenen Eingaben. */
export type FormularZustand =
  | {
      fehler: Record<string, string>;
      meldung: string | null;
      werte: Record<string, string>;
      /** Zähler, damit die Oberfläche jeden Absendeversuch erkennt. */
      versuche: number;
    }
  | null;

// Eine Instanz je Serverprozess. Auf Vercel kann es mehrere Instanzen geben —
// die verbindliche Grenze liegt zusätzlich in der Datenbankfunktion.
const limiter = erstelleRatenbegrenzer();

export async function sendeAnfrage(
  vorher: FormularZustand,
  formData: FormData,
): Promise<FormularZustand> {
  const eingabe = formDataZuObjekt(formData);
  const kopfzeilen = await headers();

  const slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase();
  const zeitzone = String(formData.get("zeitzone") ?? "").trim() || "Europe/Berlin";

  const ergebnis = await verarbeiteAnfrage(
    eingabe,
    {
      slug,
      heute: jetztInZeitzone(zeitzone).slice(0, 10),
      kennung: clientKennung(kopfzeilen),
      verbunden: isSupabaseConfigured,
    },
    {
      limiter,
      absenden: (anfrage) => sendeOeffentlicheAnfrage(anfrage),
    },
  );

  if (ergebnis.erfolg) {
    // Baustein 4: Hier wird künftig die Bestätigungs-E-Mail angestoßen
    // (Resend, mit statusLink(token, siteUrl)) — noch kein Versand.
    // Weiterleitung auf die Statusseite, die zugleich die Erfolgsmeldung zeigt.
    redirect(`${statusLink(ergebnis.publicToken, "")}?neu=1`);
  }

  return {
    fehler: ergebnis.fehler,
    meldung: ergebnis.meldung,
    werte: ergebnis.werte,
    versuche: (vorher?.versuche ?? 0) + 1,
  };
}
