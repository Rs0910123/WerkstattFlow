import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Verfuegbarkeitsregel } from "@/lib/portal/kalender.ts";

import { ladeDashboardKontext, type DashboardFirma } from "./daten.ts";
import { zerlegeZeitraum, type KalenderAnfrage, type KalenderTermin } from "./kalender.ts";

/**
 * Datenzugriff der Termin-/Kalenderübersicht (Baustein 3, Teil B1b).
 *
 * Grundregel wie im übrigen Dashboard: Es wird NIE ohne Mandantenfilter
 * gefragt. Jede Abfrage läuft mit der Sitzung des angemeldeten Benutzers und
 * setzt zusätzlich `company_id = <eigene Werkstatt>`; welche Zeilen tatsächlich
 * herauskommen, entscheidet die Row-Level-Security (Migration
 * 20260101000200) — der Filter im Code macht die Absicht nur sichtbar. Die
 * Trennung ist zusätzlich in scripts/rls-check.sh nachgewiesen.
 */

export type KalenderLadung =
  | {
      status: "ok";
      firma: DashboardFirma;
      zeitzone: string;
      termine: KalenderTermin[];
      offeneAnfragen: KalenderAnfrage[];
      verfuegbarkeiten: Verfuegbarkeitsregel[];
    }
  | { status: "nicht_konfiguriert" }
  | { status: "nicht_angemeldet" }
  | { status: "kein_profil" }
  | { status: "fehler"; meldung: string };

const TERMIN_FELDER =
  "id, title, starts_at, ends_at, status, bay, request_id, " +
  "customers(first_name, last_name), vehicles(make, model, license_plate), " +
  "requests(id, reference, service_type)";

const ANFRAGE_FELDER =
  "id, reference, service_type, status, preferred_date_from, preferred_date_to, " +
  "preferred_time_note, estimated_price_min, estimated_price_max, " +
  "customers(first_name, last_name), vehicles(make, model, license_plate)";

function alsEinzelobjekt<T>(wert: unknown): T | null {
  if (wert === null || wert === undefined) return null;
  if (Array.isArray(wert)) return (wert[0] as T | undefined) ?? null;
  return wert as T;
}

function name(vorname: string | null, nachname: string | null): string | null {
  const zusammen = `${vorname ?? ""} ${nachname ?? ""}`.trim();
  return zusammen === "" ? null : zusammen;
}

export function beschreibeFahrzeug(fahrzeug: {
  make: string | null;
  model: string | null;
  license_plate: string | null;
} | null): string | null {
  if (!fahrzeug) return null;
  const bezeichnung = `${fahrzeug.make ?? ""} ${fahrzeug.model ?? ""}`.trim();
  const kennzeichen = fahrzeug.license_plate?.trim();
  if (bezeichnung === "") return kennzeichen ? kennzeichen : null;
  return kennzeichen ? `${bezeichnung} (${kennzeichen})` : bezeichnung;
}

/** Alle Termine der eigenen Werkstatt im Zeitraum (aufsteigend nach Beginn). */
export async function ladeTermine(
  vonTag: string,
  bisTag: string,
): Promise<{ status: "ok"; termine: KalenderTermin[] } | { status: "fehler"; meldung: string }> {
  const kontext = await ladeDashboardKontext();
  if (kontext.status !== "ok") {
    return { status: "fehler", meldung: "Keine Werkstatt-Sitzung gefunden." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "fehler", meldung: "Supabase ist nicht konfiguriert." };

  const { vonIso, bisIso } = zerlegeZeitraum(vonTag, bisTag);

  const { data, error } = await supabase
    .from("appointments")
    .select(TERMIN_FELDER)
    .eq("company_id", kontext.firma.id)
    // Überschneidung statt reiner Startzeit: auch ein Termin, der vor dem
    // Zeitraum begonnen hat und hineinreicht, gehört in die Ansicht.
    .lte("starts_at", bisIso)
    .gte("ends_at", vonIso)
    .order("starts_at", { ascending: true });

  if (error) return { status: "fehler", meldung: error.message };

  const termine: KalenderTermin[] = (data ?? []).map((roh) => {
    const zeile = roh as unknown as Record<string, unknown>;
    const kunde = alsEinzelobjekt<{ first_name: string | null; last_name: string | null }>(
      zeile.customers,
    );
    const fahrzeug = alsEinzelobjekt<{
      make: string | null;
      model: string | null;
      license_plate: string | null;
    }>(zeile.vehicles);
    const anfrage = alsEinzelobjekt<{
      id: string;
      reference: string;
      service_type: string | null;
    }>(zeile.requests);

    return {
      id: zeile.id as string,
      titel: ((zeile.title as string | null) ?? "").trim() || "Termin ohne Bezeichnung",
      startsAt: zeile.starts_at as string,
      endsAt: zeile.ends_at as string,
      status: (zeile.status ?? "geplant") as string,
      bay: (zeile.bay ?? null) as string | null,
      kunde: kunde ? name(kunde.first_name, kunde.last_name) : null,
      fahrzeug: beschreibeFahrzeug(fahrzeug),
      leistung: (anfrage?.service_type ?? null) as string | null,
      referenz: (anfrage?.reference ?? null) as string | null,
      anfrageId: (anfrage?.id ?? (zeile.request_id ?? null)) as string | null,
    };
  });

  return { status: "ok", termine };
}

/** Offene (noch nicht entschiedene) Anfragen der eigenen Werkstatt. */
export async function ladeOffeneAnfragen(): Promise<
  { status: "ok"; anfragen: KalenderAnfrage[] } | { status: "fehler"; meldung: string }
> {
  const kontext = await ladeDashboardKontext();
  if (kontext.status !== "ok") {
    return { status: "fehler", meldung: "Keine Werkstatt-Sitzung gefunden." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "fehler", meldung: "Supabase ist nicht konfiguriert." };

  const { data, error } = await supabase
    .from("requests")
    .select(ANFRAGE_FELDER)
    .eq("company_id", kontext.firma.id)
    .eq("status", "neu")
    .order("preferred_date_from", { ascending: true, nullsFirst: false });

  if (error) return { status: "fehler", meldung: error.message };

  const anfragen: KalenderAnfrage[] = (data ?? []).map((roh) => {
    const zeile = roh as unknown as Record<string, unknown>;
    const kunde = alsEinzelobjekt<{ first_name: string | null; last_name: string | null }>(
      zeile.customers,
    );
    const fahrzeug = alsEinzelobjekt<{
      make: string | null;
      model: string | null;
      license_plate: string | null;
    }>(zeile.vehicles);

    return {
      id: zeile.id as string,
      reference: zeile.reference as string,
      serviceType: (zeile.service_type ?? "") as string,
      status: zeile.status as string,
      wunschVon: (zeile.preferred_date_from ?? null) as string | null,
      wunschBis: (zeile.preferred_date_to ?? null) as string | null,
      zeitHinweis: (zeile.preferred_time_note ?? null) as string | null,
      kunde: kunde ? name(kunde.first_name, kunde.last_name) : null,
      fahrzeug: beschreibeFahrzeug(fahrzeug),
      preisHinweis: preisHinweis(zeile),
    };
  });

  return { status: "ok", anfragen };
}

function preisHinweis(zeile: Record<string, unknown>): string | null {
  const von = zeile.estimated_price_min as number | null;
  const bis = zeile.estimated_price_max as number | null;
  if (von === null || von === undefined) return null;
  const formatiere = (wert: number) =>
    `${wert.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;
  if (bis === null || bis === undefined) return `ab ${formatiere(von)}`;
  return `${formatiere(von)}–${formatiere(bis)}`;
}

/** Öffnungs-/Kapazitätsregeln der Werkstatt (für "geschlossen"-Hinweise). */
export async function ladeVerfuegbarkeiten(): Promise<
  { status: "ok"; regeln: Verfuegbarkeitsregel[] } | { status: "fehler"; meldung: string }
> {
  const kontext = await ladeDashboardKontext();
  if (kontext.status !== "ok") {
    return { status: "fehler", meldung: "Keine Werkstatt-Sitzung gefunden." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "fehler", meldung: "Supabase ist nicht konfiguriert." };

  const { data, error } = await supabase
    .from("availabilities")
    .select(
      "weekday, specific_date, is_closed, open_time, close_time, slot_minutes, capacity, note",
    )
    .eq("company_id", kontext.firma.id);

  if (error) return { status: "fehler", meldung: error.message };

  return {
    status: "ok",
    regeln: (data ?? []).map((zeile) => ({
      weekday: (zeile.weekday ?? null) as number | null,
      specific_date: (zeile.specific_date ?? null) as string | null,
      is_closed: Boolean(zeile.is_closed),
      open_time: (zeile.open_time ?? null) as string | null,
      close_time: (zeile.close_time ?? null) as string | null,
      slot_minutes: (zeile.slot_minutes ?? null) as number | null,
      capacity: (zeile.capacity ?? 1) as number,
      note: (zeile.note ?? null) as string | null,
    })),
  };
}

/**
 * Alles, was die Kalenderansicht für einen Zeitraum braucht — in einem Aufruf:
 * eigener Mandant, Termine, offene Anfragen und die Verfügbarkeitsregeln.
 */
export async function ladeKalenderdaten(vonTag: string, bisTag: string): Promise<KalenderLadung> {
  const kontext = await ladeDashboardKontext();
  if (kontext.status !== "ok") return kontext;

  const [termine, anfragen, verfuegbarkeiten] = await Promise.all([
    ladeTermine(vonTag, bisTag),
    ladeOffeneAnfragen(),
    ladeVerfuegbarkeiten(),
  ]);

  for (const ladung of [termine, anfragen, verfuegbarkeiten]) {
    if (ladung.status === "fehler") return { status: "fehler", meldung: ladung.meldung };
  }

  return {
    status: "ok",
    firma: kontext.firma,
    zeitzone: kontext.firma.timezone || "Europe/Berlin",
    termine: termine.status === "ok" ? termine.termine : [],
    offeneAnfragen: anfragen.status === "ok" ? anfragen.anfragen : [],
    verfuegbarkeiten: verfuegbarkeiten.status === "ok" ? verfuegbarkeiten.regeln : [],
  };
}
