/**
 * Einfache Ratenbegrenzung für das öffentliche Anfrageformular.
 *
 * Der Zähler liegt im Arbeitsspeicher der jeweiligen Server-Instanz. Auf Vercel
 * kann es mehrere Instanzen geben — die Grenze ist deshalb „weich“ und nur die
 * erste Verteidigungslinie; die zweite liegt in der Datenbank
 * (public.create_public_request: höchstens eine Anfrage pro Minute und Kunde,
 * höchstens fünf pro Stunde). Diese Grenze schützt vor einfachen Skripten.
 *
 * Die Uhr ist injizierbar, damit das Verhalten ohne Warten prüfbar ist
 * (tests/portal-basics.test.ts).
 */

export const MAX_ANFRAGEN = 5;
export const FENSTER_MS = 10 * 60 * 1000;

export type Ratenbegrenzer = {
  pruefe(schluessel: string): { erlaubt: boolean; warteSekunden: number };
  zuruecksetzen(): void;
};

export function erstelleRatenbegrenzer(optionen?: {
  max?: number;
  fensterMs?: number;
  jetzt?: () => number;
}): Ratenbegrenzer {
  const max = optionen?.max ?? MAX_ANFRAGEN;
  const fensterMs = optionen?.fensterMs ?? FENSTER_MS;
  const jetzt = optionen?.jetzt ?? (() => Date.now());
  const zugriffe = new Map<string, number[]>();

  return {
    pruefe(schluessel: string) {
      const nun = jetzt();
      const bisher = (zugriffe.get(schluessel) ?? []).filter(
        (zeitpunkt) => nun - zeitpunkt < fensterMs,
      );

      if (bisher.length >= max) {
        const aeltester = bisher[0] ?? nun;
        const warteSekunden = Math.max(
          1,
          Math.ceil((aeltester + fensterMs - nun) / 1000),
        );
        zugriffe.set(schluessel, bisher);
        return { erlaubt: false, warteSekunden };
      }

      bisher.push(nun);
      zugriffe.set(schluessel, bisher);
      return { erlaubt: true, warteSekunden: 0 };
    },
    zuruecksetzen() {
      zugriffe.clear();
    },
  };
}

/**
 * Kennung des Aufrufers für die Ratenbegrenzung: die erste Adresse aus
 * `x-forwarded-for` (Vercel setzt den Header), sonst ein neutraler Wert.
 * Es wird kein vollständiger Verlauf gespeichert, nur ein Zähler je Kennung.
 */
export function clientKennung(
  kopfzeilen: { get(name: string): string | null } | null | undefined,
): string {
  const weitergeleitet = kopfzeilen?.get("x-forwarded-for") ?? "";
  const erste = weitergeleitet.split(",")[0]?.trim();
  if (erste) return erste;
  return kopfzeilen?.get("x-real-ip")?.trim() || "unbekannt";
}
