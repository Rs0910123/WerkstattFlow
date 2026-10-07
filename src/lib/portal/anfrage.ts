/**
 * Kern des Absendewegs einer Kundenanfrage.
 *
 * Diese Datei enthält die gesamte Ablauflogik — Honeypot, Ratenbegrenzung,
 * Validierung, **serverseitige** Preisschätzung, Datenbankaufruf und
 * Fehlerübersetzung — als reine Funktion. Netzwerk und Datenbank sind
 * hineingereicht (Abhängigkeiten), damit der Ablauf ohne Supabase prüfbar ist
 * (tests/portal/anfrage.test.ts).
 *
 * Die Server Action (src/lib/actions/anfrage.ts) reicht die echten
 * Abhängigkeiten hinein: den Ratenbegrenzer, den Datenbankzugriff und die
 * Kopfzeilen des Aufrufers. Die Preisspanne kommt NIEMALS aus dem Browser:
 * Was auch immer im Formular mitgeschickt wird, wird verworfen und hier neu
 * berechnet.
 */

import {
  HONEYPOT_FELD,
  formDataZuObjekt,
  istHoneypotGefuellt,
  parseAnfrageFormular,
  type AnfrageDaten,
  type PruefEingabe,
} from "./anfrage-schema.ts";
import { FEHLER_STANDARD, uebersetzeDbFehler } from "./fehler.ts";
import { formatiereMinute, formatiereSlot } from "./format.ts";
import { schaetzePreis, type Preisschaetzung } from "./preisschaetzung.ts";
import type { Ratenbegrenzer } from "./rate-limit.ts";

/** Kontext eines Absendeversuchs (alles serverseitig ermittelt). */
export type AnfrageKontext = {
  /** Werkstatt-Slug aus der URL — bestimmt den Mandanten in der Datenbank. */
  slug: string;
  /** Heutiges Datum in der Zeitzone der Werkstatt ("YYYY-MM-DD"). */
  heute: string;
  /** Kennung des Aufrufers für die Ratenbegrenzung (nur ein Zähler). */
  kennung: string;
  /** Ist die Datenbankverbindung eingerichtet? */
  verbunden: boolean;
};

/** Fertig geprüfte Anfrage inklusive Terminnotiz und Preisschätzung. */
export type SendeAnfrage = {
  slug: string;
  daten: AnfrageDaten;
  /** "08:00–09:00 Uhr" — die Auswahl aus dem Kalender, nicht aus dem Browser. */
  zeitnotiz: string;
  preis: Preisschaetzung | null;
};

export type AbsendeErgebnis =
  | { fehler: { message: string } }
  | { fehler: null; data: unknown };

export type AbsendeFunktion = (anfrage: SendeAnfrage) => Promise<AbsendeErgebnis>;

export type AnfrageArt =
  | "spam"
  | "begrenzt"
  | "eingabe"
  | "offline"
  | "werkstatt"
  | "technisch";

export type AnfrageErgebnis =
  | {
      erfolg: true;
      publicToken: string;
      reference: string;
      preis: Preisschaetzung | null;
    }
  | {
      erfolg: false;
      art: AnfrageArt;
      /** Deutsche Meldung für den Kopf des Formulars. */
      meldung: string;
      /** Fehler je Feld (deutsch) — leer, wenn kein Feld betroffen ist. */
      fehler: Record<string, string>;
      /** Eingaben für das erneute Anzeigen (ohne Honeypot). */
      werte: Record<string, string>;
    };

export const TEXT_ZU_SCHNELL =
  "Ihre Anfrage wurde gerade eben schon übermittelt. Bitte warten Sie eine Minute und versuchen Sie es dann erneut.";

export const TEXT_OFFLINE =
  "Das Kundenportal ist noch nicht mit der Datenbank verbunden. Die Anfrage konnte deshalb nicht gespeichert werden — bitte rufen Sie die Werkstatt direkt an.";

export const TEXT_SPAM =
  "Die Anfrage konnte nicht geprüft werden. Bitte laden Sie die Seite neu und versuchen Sie es erneut.";

/** Felder, die zurück ins Formular dürfen (Honeypot bleibt außen vor). */
const FORMULAR_FELDER = [
  "service_type",
  "description",
  "preferred_date",
  "slot_start",
  "slot_end",
  "first_name",
  "last_name",
  "email",
  "phone",
  "contact_preference",
  "vehicle_make",
  "vehicle_model",
  "vehicle_year",
  "vehicle_mileage",
  "vehicle_fuel_type",
  "license_plate",
  "einwilligung",
] as const;

/** Eingaben als Zeichenketten für das Formular aufbereiten. */
export function werteFuerFormular(eingabe: PruefEingabe): Record<string, string> {
  const werte: Record<string, string> = {};
  for (const feld of FORMULAR_FELDER) {
    const wert = eingabe[feld];
    if (typeof wert === "string") {
      werte[feld] = wert;
    } else if (typeof wert === "number" && Number.isFinite(wert)) {
      werte[feld] = String(wert);
    } else if (wert === true) {
      werte[feld] = "on";
    }
  }
  return werte;
}

/** Slot-Grenzen ("08:00", "09:00") als lesbare Terminnotiz. */
export function zeitnotizAusSlot(
  slotStart: string | null | undefined,
  slotEnd: string | null | undefined,
): string {
  const minuten = (wert: string | null | undefined): number | null => {
    if (typeof wert !== "string") return null;
    const treffer = /^(\d{2}):(\d{2})$/.exec(wert.trim());
    if (!treffer) return null;
    return Number(treffer[1]) * 60 + Number(treffer[2]);
  };
  const start = minuten(slotStart);
  const ende = minuten(slotEnd);
  if (start === null && ende === null) return "Wunschtermin aus dem Kalender";
  if (start === null || ende === null) {
    const einzel = formatiereMinute(start ?? ende ?? 0);
    return `Wunschtermin ab ${einzel} Uhr`;
  }
  return formatiereSlot(start, ende);
}

/** Preisspanne aus den geprüften Angaben — ausschließlich hier berechnet. */
export function preisAusDaten(daten: AnfrageDaten): Preisschaetzung | null {
  return schaetzePreis(daten.service_type, {
    baujahr: daten.vehicle_year,
    kilometerstand: daten.vehicle_mileage,
    kraftstoff: daten.vehicle_fuel_type,
  });
}

function fehlschlag(
  art: AnfrageArt,
  meldung: string,
  eingabe: PruefEingabe,
  fehler: Record<string, string> = {},
): AnfrageErgebnis {
  return { erfolg: false, art, meldung, fehler, werte: werteFuerFormular(eingabe) };
}

/** Antwort der Datenbankfunktion auswerten: genau eine Zeile mit Token + Referenz. */
export function leseAntwort(daten: unknown): { publicToken: string; reference: string } | null {
  const zeile = Array.isArray(daten) ? daten[0] : daten;
  if (!zeile || typeof zeile !== "object") return null;
  const eintrag = zeile as { public_token?: unknown; reference?: unknown };
  const token = typeof eintrag.public_token === "string" ? eintrag.public_token : "";
  const reference =
    typeof eintrag.reference === "string"
      ? eintrag.reference
      : typeof eintrag.reference === "number"
        ? String(eintrag.reference)
        : "";
  if (token === "" || reference === "") return null;
  return { publicToken: token, reference };
}

export async function verarbeiteAnfrage(
  eingabe: PruefEingabe,
  kontext: AnfrageKontext,
  abhaengigkeiten: { limiter: Ratenbegrenzer; absenden: AbsendeFunktion },
): Promise<AnfrageErgebnis> {
  // 1. Spamschutz: Bots füllen das unsichtbare Feld aus. Es wird nichts
  //    gespeichert und nichts verraten.
  if (istHoneypotGefuellt(eingabe)) {
    return { erfolg: false, art: "spam", meldung: TEXT_SPAM, fehler: {}, werte: {} };
  }

  // 2. Validierung (deutsche Meldungen, Feld für Feld). Sie läuft VOR der
  //    Ratenbegrenzung, damit Tippfehler das Kontingent nicht verbrauchen.
  const geprueft = parseAnfrageFormular(eingabe, { heute: kontext.heute });
  if (!geprueft.erfolg) {
    return {
      erfolg: false,
      art: "eingabe",
      meldung:
        "Bitte prüfen Sie die markierten Felder — so können wir Ihre Anfrage aufnehmen.",
      fehler: geprueft.fehler,
      werte: werteFuerFormular(eingabe),
    };
  }

  // 3. Ratenbegrenzung (erste Verteidigungslinie, zweite liegt in der Datenbank:
  //    höchstens eine Anfrage pro Minute und Kunde, höchstens fünf pro Stunde).
  const begrenzung = abhaengigkeiten.limiter.pruefe(
    `${kontext.slug}|${kontext.kennung}`,
  );
  if (!begrenzung.erlaubt) {
    return fehlschlag(
      "begrenzt",
      `Bitte warten Sie noch ${begrenzung.warteSekunden} Sekunden, bevor Sie eine weitere Anfrage senden.`,
      eingabe,
    );
  }

  // 4. Kein Slug: nie eine Anfrage ohne Mandant anlegen.
  if (kontext.slug.trim() === "") {
    return fehlschlag(
      "werkstatt",
      uebersetzeDbFehler("werkstatt_unbekannt"),
      eingabe,
    );
  }

  // 5. Ohne Datenbankverbindung wird nichts gespeichert (deutscher Hinweis).
  if (!kontext.verbunden) {
    return fehlschlag("offline", TEXT_OFFLINE, eingabe);
  }

  // 6. Preisschätzung ausschließlich serverseitig — Werte aus dem Browser
  //    werden bewusst nicht gelesen.
  const preis = preisAusDaten(geprueft.daten);

  // 7. Absenden (RPC public.create_public_request mit dem Slug).
  let antwort: AbsendeErgebnis;
  try {
    antwort = await abhaengigkeiten.absenden({
      slug: kontext.slug.trim().toLowerCase(),
      daten: geprueft.daten,
      zeitnotiz: zeitnotizAusSlot(geprueft.daten.slot_start, geprueft.daten.slot_end),
      preis,
    });
  } catch {
    return fehlschlag("technisch", FEHLER_STANDARD, eingabe);
  }

  if (antwort.fehler) {
    const meldung = uebersetzeDbFehler(antwort.fehler.message);
    const art: AnfrageArt = (antwort.fehler.message ?? "").includes(
      "werkstatt_unbekannt",
    )
      ? "werkstatt"
      : "technisch";
    return fehlschlag(art, meldung, eingabe);
  }

  const gelesen = leseAntwort(antwort.data);
  if (!gelesen) {
    return fehlschlag("technisch", FEHLER_STANDARD, eingabe);
  }

  return {
    erfolg: true,
    publicToken: gelesen.publicToken,
    reference: gelesen.reference,
    preis,
  };
}

/** FormData-Absendung ohne Next.js prüfen (Tests). */
export function eingabeAusFormData(formData: FormData): PruefEingabe {
  return formDataZuObjekt(formData);
}

export { HONEYPOT_FELD };
