/**
 * Validierung des mehrstufigen Anfrageformulars (deutsche Fehlermeldungen).
 *
 * Reine Funktion: Sie bekommt die Formularwerte als Objekt und das heutige
 * Datum in der Werkstatt-Zeitzone und liefert entweder die geprüften, für die
 * Datenbank passenden Werte oder eine Zuordnung Feld → Fehlertext.
 * Damit hängt die Validierung weder an Next.js noch an Supabase
 * (tests/anfrage-schema.test.ts).
 */

import { z } from "zod";

import { HORIZONT_TAGE } from "./kalender.ts";
import { istIsoDatum, tageZwischen } from "./format.ts";
import { istBekannteLeistung } from "./leistungen.ts";

/** Verstecktes Feld gegen Spam-Bots (muss leer bleiben). */
export const HONEYPOT_FELD = "website";

/** Pflicht-Checkbox zur Kontaktaufnahme (Datenschutz). */
export const EINWILLIGUNG_FELD = "einwilligung";

export const KONTAKTWEGE = ["email", "telefon", "sms"] as const;
export type Kontaktweg = (typeof KONTAKTWEGE)[number];

export const KONTAKTWEG_TEXTE: Record<Kontaktweg, string> = {
  email: "Per E-Mail",
  telefon: "Telefonisch anrufen",
  sms: "Per SMS",
};

export const KRAFTSTOFF_OPTIONEN = [
  { wert: "benzin", label: "Benzin" },
  { wert: "diesel", label: "Diesel" },
  { wert: "elektro", label: "Elektro" },
  { wert: "hybrid", label: "Hybrid" },
  { wert: "gas", label: "Gas / Autogas" },
  { wert: "sonstiges", label: "Sonstiges / unbekannt" },
] as const;

export type AnfrageDaten = {
  service_type: string;
  description: string | null;
  preferred_date: string;
  slot_start: string;
  slot_end: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  contact_preference: Kontaktweg;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number | null;
  vehicle_mileage: number | null;
  vehicle_fuel_type: string | null;
  license_plate: string;
};

export type PruefEingabe = Record<string, unknown>;

function text(wert: unknown): string {
  if (typeof wert === "string") return wert.trim();
  if (typeof wert === "number" && Number.isFinite(wert)) return String(wert);
  return "";
}

function leerZuNull(wert: unknown): string | null {
  const geputzt = text(wert);
  return geputzt === "" ? null : geputzt;
}

/** "118.400" oder "118400 km" -> 118400. Leere Eingabe -> null. */
function zahlOderNull(wert: unknown): number | null {
  const geputzt = text(wert);
  if (geputzt === "") return null;
  const ziffern = geputzt.replace(/[^\d]/g, "");
  if (ziffern === "") return null;
  const zahl = Number(ziffern);
  return Number.isSafeInteger(zahl) ? zahl : null;
}

const ZEIT_MUSTER = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Muss das Feld leer bleiben (Spamschutz)? */
export function istHoneypotGefuellt(eingabe: PruefEingabe): boolean {
  return text(eingabe[HONEYPOT_FELD]) !== "";
}

export type PruefErgebnis =
  | { erfolg: true; daten: AnfrageDaten }
  | { erfolg: false; fehler: Record<string, string> };

export type PruefOptionen = {
  /** Heutiges Datum in der Werkstatt-Zeitzone ("YYYY-MM-DD"). */
  heute: string;
};

export function parseAnfrageFormular(
  eingabe: PruefEingabe,
  optionen: PruefOptionen,
): PruefErgebnis {
  const schema = z
    .object({
      service_type: z.preprocess(
        text,
        z
          .string()
          .min(1, "Bitte wählen Sie die Leistung aus.")
          .refine(
            istBekannteLeistung,
            "Bitte wählen Sie eine Leistung aus der Liste aus.",
          ),
      ),
      description: z.preprocess(
        leerZuNull,
        z
          .string()
          .max(2000, "Bitte kürzen Sie die Beschreibung auf 2.000 Zeichen.")
          .nullable(),
      ),
      preferred_date: z.preprocess(
        text,
        z
          .string()
          .min(1, "Bitte wählen Sie im Kalender einen Wunschtermin aus.")
          .refine(istIsoDatum, "Bitte wählen Sie einen gültigen Wunschtermin aus.")
          .refine(
            (datum) => tageZwischen(optionen.heute, datum) >= 0,
            "Der Wunschtermin liegt in der Vergangenheit.",
          )
          .refine(
            (datum) => tageZwischen(optionen.heute, datum) <= HORIZONT_TAGE,
            `Bitte wählen Sie einen Termin innerhalb der nächsten ${HORIZONT_TAGE} Tage.`,
          ),
      ),
      slot_start: z.preprocess(
        text,
        z.string().regex(ZEIT_MUSTER, "Bitte wählen Sie einen freien Termin aus."),
      ),
      slot_end: z.preprocess(
        text,
        z.string().regex(ZEIT_MUSTER, "Bitte wählen Sie einen freien Termin aus."),
      ),
      first_name: z.preprocess(
        text,
        z
          .string()
          .min(2, "Bitte geben Sie Ihren Vornamen an.")
          .max(80, "Bitte kürzen Sie den Vornamen."),
      ),
      last_name: z.preprocess(
        text,
        z
          .string()
          .min(2, "Bitte geben Sie Ihren Nachnamen an.")
          .max(80, "Bitte kürzen Sie den Nachnamen."),
      ),
      email: z.preprocess(
        leerZuNull,
        z
          .union([
            z
              .string()
              .max(160, "Bitte kürzen Sie die E-Mail-Adresse.")
              .email("Bitte geben Sie eine gültige E-Mail-Adresse an."),
            z.null(),
          ])
          .nullable(),
      ),
      phone: z.preprocess(
        leerZuNull,
        z
          .union([
            z
              .string()
              .min(5, "Bitte geben Sie eine gültige Telefonnummer an.")
              .max(40, "Bitte kürzen Sie die Telefonnummer."),
            z.null(),
          ])
          .nullable(),
      ),
      contact_preference: z.preprocess((wert) => {
        const geputzt = text(wert).toLowerCase();
        return (KONTAKTWEGE as readonly string[]).includes(geputzt)
          ? geputzt
          : "email";
      }, z.enum(KONTAKTWEGE)),
      vehicle_make: z.preprocess(
        text,
        z
          .string()
          .min(2, "Bitte geben Sie die Marke an (z. B. Volkswagen).")
          .max(80, "Bitte kürzen Sie die Marke."),
      ),
      vehicle_model: z.preprocess(
        text,
        z
          .string()
          .min(1, "Bitte geben Sie das Modell an (z. B. Golf 7).")
          .max(80, "Bitte kürzen Sie das Modell."),
      ),
      license_plate: z.preprocess(
        (wert) => text(wert).toUpperCase().replace(/\s+/g, " "),
        z
          .string()
          .min(3, "Bitte geben Sie das Kennzeichen an.")
          .max(20, "Bitte kürzen Sie das Kennzeichen."),
      ),
      vehicle_year: z.preprocess(
        zahlOderNull,
        z
          .union([
            z
              .number()
              .int()
              .min(1886, "Bitte geben Sie ein gültiges Baujahr an (1886–2100).")
              .max(2100, "Bitte geben Sie ein gültiges Baujahr an (1886–2100)."),
            z.null(),
          ])
          .nullable(),
      ),
      vehicle_mileage: z.preprocess(
        zahlOderNull,
        z
          .union([
            z
              .number()
              .int()
              .min(0, "Der Kilometerstand darf nicht negativ sein.")
              .max(3_000_000, "Bitte prüfen Sie den Kilometerstand."),
            z.null(),
          ])
          .nullable(),
      ),
      vehicle_fuel_type: z.preprocess((wert) => {
        const geputzt = text(wert).toLowerCase();
        return KRAFTSTOFF_OPTIONEN.some((option) => option.wert === geputzt)
          ? geputzt
          : null;
      }, z.string().nullable()),
      [EINWILLIGUNG_FELD]: z.preprocess(
        (wert) => wert === true || wert === "true" || wert === "on" || wert === "1",
        z.literal(true, {
          errorMap: () => ({
            message:
              "Bitte bestätigen Sie, dass wir Sie zur Anfrage kontaktieren dürfen.",
          }),
        }),
      ),
    })
    .superRefine((werte, ctx) => {
      if (!werte.email && !werte.phone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["email"],
          message:
            "Bitte geben Sie eine E-Mail-Adresse oder eine Telefonnummer an, damit die Werkstatt Sie erreichen kann.",
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["phone"],
          message: "E-Mail-Adresse oder Telefonnummer ist erforderlich.",
        });
      }
      if (werte.contact_preference !== "email" && !werte.phone) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["contact_preference"],
          message:
            "Für einen Rückruf oder eine SMS brauchen wir Ihre Telefonnummer.",
        });
      }
    });

  const ergebnis = schema.safeParse(eingabe);

  if (!ergebnis.success) {
    const fehler: Record<string, string> = {};
    for (const problem of ergebnis.error.issues) {
      const feld = String(problem.path[0] ?? "formular");
      if (!fehler[feld]) fehler[feld] = problem.message;
    }
    return { erfolg: false, fehler };
  }

  const { [EINWILLIGUNG_FELD]: _einwilligung, ...rest } = ergebnis.data;
  return { erfolg: true, daten: rest as AnfrageDaten };
}

/** FormData in ein einfaches Objekt überführen (für Server-Action und Tests). */
export function formDataZuObjekt(formData: FormData): PruefEingabe {
  const objekt: PruefEingabe = {};
  for (const [schluessel, wert] of formData.entries()) {
    if (typeof wert === "string") objekt[schluessel] = wert;
  }
  return objekt;
}
