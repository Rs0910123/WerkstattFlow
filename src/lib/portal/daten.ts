import "server-only";

import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  HORIZONT_TAGE,
  VORLAUF_STUNDEN,
  berechneTagesangebote,
  beschreibeOeffnungszeiten,
  naechsteFreieTage,
  type Auslastungsfenster,
  type OeffnungszeitenBild,
  type Tagesangebot,
  type Verfuegbarkeitsregel,
} from "./kalender.ts";
import { datumPlusTage, jetztInZeitzone } from "./format.ts";
import { normalisiereToken } from "./token.ts";
import type { AbsendeErgebnis } from "./anfrage.ts";
import type { AnfrageDaten } from "./anfrage-schema.ts";
import type { Preisschaetzung } from "./preisschaetzung.ts";

/**
 * Öffentlicher Datenzugriffspfad des Kundenportals (serverseitig, eng gefasst).
 *
 * Diese Datei ist die EINZIGE Stelle, an der die öffentliche Werkstattseite an
 * Daten kommt. Sie liest ausschließlich über die drei Datenbankfunktionen
 * public.get_public_workshop / get_public_availabilities / get_public_busy_times
 * (siehe supabase/migrations/20260101000400_public_customer_portal.sql). Damit
 * gibt es keinen Tabellenzugriff für nicht angemeldete Besucher und die
 * Mandanten-Trennung bleibt in der Datenbank verankert.
 *
 * Nichts hier wirft Fehler nach außen: Ist Supabase nicht verbunden oder der
 * Slug unbekannt, kommt `null` zurück und die Oberfläche zeigt einen deutschen
 * Hinweis bzw. eine saubere 404-Seite.
 */

export type OeffentlicheWerkstatt = {
  name: string;
  slug: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  telefon: string | null;
  email: string | null;
  akzentfarbe: string | null;
  zeitzone: string;
  /** "Heute" in der Zeitzone der Werkstatt ("YYYY-MM-DD"). */
  heute: string;
  /** Alle Tage des Buchungszeitraums inklusive Slots. */
  tage: Tagesangebot[];
  naechsteFreie: Tagesangebot[];
  oeffnungszeiten: OeffnungszeitenBild;
};

/** Eine einzelne Anfrage für die Statusseite des Kunden (ohne Fremddaten). */
export type OeffentlicheAnfrage = {
  reference: string;
  status: string;
  serviceType: string | null;
  description: string | null;
  preferredDateFrom: string | null;
  preferredDateTo: string | null;
  preferredTimeNote: string | null;
  estimatedPriceMin: number | null;
  estimatedPriceMax: number | null;
  priceEstimateNote: string | null;
  rejectionReason: string | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  appointmentStartsAt: string | null;
  appointmentEndsAt: string | null;
  workshopName: string | null;
  workshopSlug: string | null;
  workshopPhone: string | null;
  workshopEmail: string | null;
  workshopStreet: string | null;
  workshopPostalCode: string | null;
  workshopCity: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  decidedAt: string | null;
};

type AnfrageZeile = {
  reference: string;
  status: string;
  service_type: string | null;
  description: string | null;
  preferred_date_from: string | null;
  preferred_date_to: string | null;
  preferred_time_note: string | null;
  estimated_price_min: number | null;
  estimated_price_max: number | null;
  price_estimate_note: string | null;
  rejection_reason: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  appointment_starts_at: string | null;
  appointment_ends_at: string | null;
  workshop_name: string | null;
  workshop_slug: string | null;
  workshop_phone: string | null;
  workshop_email: string | null;
  workshop_street: string | null;
  workshop_postal_code: string | null;
  workshop_city: string | null;
  created_at: string | null;
  updated_at: string | null;
  decided_at: string | null;
};

type WerkstattZeile = {
  id: string;
  name: string;
  slug: string;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  accent_color: string | null;
  slot_minutes: number | null;
  timezone: string | null;
};

type VerfuegbarkeitZeile = {
  weekday: number | null;
  specific_date: string | null;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  slot_minutes: number | null;
  capacity: number;
  note: string | null;
};

type AuslastungZeile = {
  day: string;
  starts_minute: number;
  ends_minute: number;
};

/** Öffentliche Werkstattseite laden. `null` = unbekannter Slug oder kein Supabase. */
export async function ladeOeffentlicheWerkstatt(
  slug: string,
): Promise<OeffentlicheWerkstatt | null> {
  const saubererSlug = slug.trim().toLowerCase();
  if (saubererSlug === "") return null;
  if (!isSupabaseConfigured) return null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data: werkstattDaten, error: werkstattFehler } = await supabase.rpc(
    "get_public_workshop",
    { p_slug: saubererSlug },
  );
  if (werkstattFehler) return null;

  const werkstatt = (werkstattDaten as WerkstattZeile[] | null)?.[0];
  if (!werkstatt) return null;

  const zeitzone = werkstatt.timezone?.trim() || "Europe/Berlin";
  const heute = jetztInZeitzone(zeitzone).slice(0, 10);
  const bis = datumPlusTage(heute, HORIZONT_TAGE);

  const [{ data: verfuegbarkeiten }, { data: auslastung }] = await Promise.all([
    supabase.rpc("get_public_availabilities", { p_slug: saubererSlug }),
    supabase.rpc("get_public_busy_times", {
      p_slug: saubererSlug,
      p_from: heute,
      p_to: bis,
    }),
  ]);

  const regeln = ((verfuegbarkeiten ?? []) as VerfuegbarkeitZeile[]).map(
    (zeile): Verfuegbarkeitsregel => ({
      weekday: zeile.weekday,
      specific_date: zeile.specific_date,
      is_closed: zeile.is_closed,
      open_time: zeile.open_time,
      close_time: zeile.close_time,
      slot_minutes: zeile.slot_minutes,
      capacity: zeile.capacity,
      note: zeile.note,
    }),
  );

  const belegteZeiten = ((auslastung ?? []) as AuslastungZeile[]).map(
    (zeile): Auslastungsfenster => ({
      day: zeile.day,
      startsMinute: zeile.starts_minute,
      endsMinute: zeile.ends_minute,
    }),
  );

  const tage = berechneTagesangebote({
    regeln,
    auslastung: belegteZeiten,
    von: heute,
    bis,
    jetzt: jetztInZeitzone(zeitzone),
    vorlaufStunden: VORLAUF_STUNDEN,
    slotMinutenFallback: werkstatt.slot_minutes ?? 60,
  });

  return {
    name: werkstatt.name,
    slug: werkstatt.slug,
    strasse: werkstatt.street,
    plz: werkstatt.postal_code,
    ort: werkstatt.city,
    telefon: werkstatt.phone,
    email: werkstatt.email,
    akzentfarbe: werkstatt.accent_color,
    zeitzone,
    heute,
    tage,
    naechsteFreie: naechsteFreieTage(tage, 3),
    oeffnungszeiten: beschreibeOeffnungszeiten(regeln),
  };
}

/**
 * Eine einzelne Anfrage anhand ihres öffentlichen Tokens laden (Statusseite).
 * `null` = unbekannter Token, kein Supabase oder technischer Fehler. Die
 * Datenbankfunktion liefert höchstens EINE Anfrage — fremde Daten können so
 * nicht über die Statusseite sichtbar werden.
 */
export async function ladeOeffentlicheAnfrage(
  token: string,
): Promise<OeffentlicheAnfrage | null> {
  const sauber = normalisiereToken(token);
  if (!sauber) return null;
  if (!isSupabaseConfigured) return null;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("get_public_request", {
    p_token: sauber,
  });
  if (error) return null;

  const zeile = (data as AnfrageZeile[] | null)?.[0];
  if (!zeile) return null;

  return {
    reference: zeile.reference,
    status: zeile.status,
    serviceType: zeile.service_type,
    description: zeile.description,
    preferredDateFrom: zeile.preferred_date_from,
    preferredDateTo: zeile.preferred_date_to,
    preferredTimeNote: zeile.preferred_time_note,
    estimatedPriceMin: zeile.estimated_price_min,
    estimatedPriceMax: zeile.estimated_price_max,
    priceEstimateNote: zeile.price_estimate_note,
    rejectionReason: zeile.rejection_reason,
    vehicleMake: zeile.vehicle_make,
    vehicleModel: zeile.vehicle_model,
    appointmentStartsAt: zeile.appointment_starts_at,
    appointmentEndsAt: zeile.appointment_ends_at,
    workshopName: zeile.workshop_name,
    workshopSlug: zeile.workshop_slug,
    workshopPhone: zeile.workshop_phone,
    workshopEmail: zeile.workshop_email,
    workshopStreet: zeile.workshop_street,
    workshopPostalCode: zeile.workshop_postal_code,
    workshopCity: zeile.workshop_city,
    createdAt: zeile.created_at,
    updatedAt: zeile.updated_at,
    decidedAt: zeile.decided_at,
  };
}

/**
 * Anfrage anlegen — der einzige Schreibweg für nicht angemeldete Besucher.
 * Der Mandant wird allein über den Slug bestimmt; Kunden-, Fahrzeug- und
 * Anfragedatensatz entstehen in der Datenbankfunktion (Baustein 2, Migration
 * 20260101000400). Die Preisspanne kommt fertig berechnet herein.
 *
 * Der Fehler wird NICHT hier übersetzt, sondern in src/lib/portal/anfrage.ts
 * (uebersetzeDbFehler) — so bleibt die Übersetzung testbar.
 */
export async function sendeOeffentlicheAnfrage(anfrage: {
  slug: string;
  daten: AnfrageDaten;
  zeitnotiz: string;
  preis: Preisschaetzung | null;
}): Promise<AbsendeErgebnis> {
  if (!isSupabaseConfigured) {
    return { fehler: { message: "datenbank_nicht_verbunden" } };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { fehler: { message: "datenbank_nicht_verbunden" } };
  }

  const { daten, preis, zeitnotiz } = anfrage;

  const { data, error } = await supabase.rpc("create_public_request", {
    p_slug: anfrage.slug,
    p_service_type: daten.service_type,
    p_description: daten.description,
    p_preferred_date: daten.preferred_date,
    p_preferred_time_note: zeitnotiz,
    p_first_name: daten.first_name,
    p_last_name: daten.last_name,
    p_email: daten.email,
    p_phone: daten.phone,
    p_contact_preference: daten.contact_preference,
    p_vehicle_make: daten.vehicle_make,
    p_vehicle_model: daten.vehicle_model,
    p_vehicle_year: daten.vehicle_year,
    p_vehicle_mileage: daten.vehicle_mileage,
    p_license_plate: daten.license_plate,
    p_estimated_price_min: preis?.min ?? null,
    p_estimated_price_max: preis?.max ?? null,
    p_price_estimate_note: preis ? preis.hinweis : null,
  });

  if (error) return { fehler: { message: error.message } };
  return { fehler: null, data };
}
