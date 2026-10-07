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
