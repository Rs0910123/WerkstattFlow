import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AnfrageStatus, TerminStatus } from "@/types/database";

/**
 * Datenzugriff des Werkstatt-Dashboards (Baustein 3, Teil A).
 *
 * Grundregel: Es wird NIE nach "allen" Anfragen gefragt. Die Abfragen laufen mit
 * der Sitzung des angemeldeten Benutzers; welche Zeilen zurückkommen, entscheidet
 * ausschließlich die Row-Level-Security (Migration 20260101000200). Die
 * zusätzlichen company_id-Filter sind nur doppelte Absicherung und machen die
 * Absicht im Code sichtbar.
 */

export type AnfrageKunde = {
  id: string;
  name: string;
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
};

export type AnfrageFahrzeug = {
  id: string;
  bezeichnung: string;
  kennzeichen: string | null;
  baujahr: number | null;
  kilometerstand: number | null;
  kraftstoff: string | null;
};

export type AnfrageTermin = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: TerminStatus;
  bay: string | null;
};

/** Eine Anfrage in der Liste wie in der Detailansicht. */
export type AnfrageZeile = {
  id: string;
  reference: string;
  status: AnfrageStatus;
  service_type: string;
  description: string | null;
  preferred_date_from: string | null;
  preferred_date_to: string | null;
  preferred_time_note: string | null;
  estimated_price_min: number | null;
  estimated_price_max: number | null;
  price_estimate_note: string | null;
  contact_preference: "email" | "telefon" | "sms";
  source: string;
  staff_note: string | null;
  rejection_reason: string | null;
  decided_at: string | null;
  created_at: string;
  kunde: AnfrageKunde | null;
  fahrzeug: AnfrageFahrzeug | null;
  termin: AnfrageTermin | null;
};

export type DashboardFirma = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  phone: string | null;
  email: string | null;
  accent_color: string;
  slot_minutes: number;
  timezone: string;
};

export type DashboardBenutzer = {
  id: string;
  name: string;
  email: string | null;
  rolle: "inhaber" | "mitarbeiter";
};

export type DashboardKontext =
  | { status: "ok"; firma: DashboardFirma; benutzer: DashboardBenutzer }
  | { status: "nicht_konfiguriert" }
  | { status: "nicht_angemeldet" }
  | { status: "kein_profil" }
  | { status: "fehler"; meldung: string };

const ANFRAGE_FELDER =
  "id, reference, status, service_type, description, " +
  "preferred_date_from, preferred_date_to, preferred_time_note, " +
  "estimated_price_min, estimated_price_max, price_estimate_note, " +
  "contact_preference, source, staff_note, rejection_reason, decided_at, created_at, " +
  "customers(id, first_name, last_name, email, phone, street, postal_code, city), " +
  "vehicles(id, make, model, year, license_plate, mileage_km, fuel_type), " +
  "appointments(id, starts_at, ends_at, status, bay)";

function alsEinzelobjekt<T>(wert: unknown): T | null {
  if (wert === null || wert === undefined) return null;
  if (Array.isArray(wert)) return (wert[0] as T | undefined) ?? null;
  return wert as T;
}

/** Rohe Zeile aus Supabase in den Anzeigetyp überführen. */
function alsAnfrageZeile(zeile: Record<string, unknown>): AnfrageZeile {
  const kunde = alsEinzelobjekt<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    street: string | null;
    postal_code: string | null;
    city: string | null;
  }>(zeile.customers);

  const fahrzeug = alsEinzelobjekt<{
    id: string;
    make: string | null;
    model: string | null;
    year: number | null;
    license_plate: string | null;
    mileage_km: number | null;
    fuel_type: string | null;
  }>(zeile.vehicles);

  const termin = alsEinzelobjekt<{
    id: string;
    starts_at: string;
    ends_at: string;
    status: TerminStatus;
    bay: string | null;
  }>(zeile.appointments);

  const vorname = (kunde?.first_name ?? "").trim();
  const nachname = (kunde?.last_name ?? "").trim();

  return {
    id: zeile.id as string,
    reference: zeile.reference as string,
    status: zeile.status as AnfrageStatus,
    service_type: (zeile.service_type ?? "") as string,
    description: (zeile.description ?? null) as string | null,
    preferred_date_from: (zeile.preferred_date_from ?? null) as string | null,
    preferred_date_to: (zeile.preferred_date_to ?? null) as string | null,
    preferred_time_note: (zeile.preferred_time_note ?? null) as string | null,
    estimated_price_min: (zeile.estimated_price_min ?? null) as number | null,
    estimated_price_max: (zeile.estimated_price_max ?? null) as number | null,
    price_estimate_note: (zeile.price_estimate_note ?? null) as string | null,
    contact_preference: (zeile.contact_preference ?? "email") as
      | "email"
      | "telefon"
      | "sms",
    source: (zeile.source ?? "online") as string,
    staff_note: (zeile.staff_note ?? null) as string | null,
    rejection_reason: (zeile.rejection_reason ?? null) as string | null,
    decided_at: (zeile.decided_at ?? null) as string | null,
    created_at: zeile.created_at as string,
    kunde: kunde
      ? {
          id: kunde.id,
          name: `${vorname} ${nachname}`.trim() || "Ohne Namen",
          vorname,
          nachname,
          email: kunde.email ?? null,
          telefon: kunde.phone ?? null,
          strasse: kunde.street ?? null,
          plz: kunde.postal_code ?? null,
          ort: kunde.city ?? null,
        }
      : null,
    fahrzeug: fahrzeug
      ? {
          id: fahrzeug.id,
          bezeichnung:
            `${(fahrzeug.make ?? "").trim()} ${(fahrzeug.model ?? "").trim()}`.trim() ||
            "Fahrzeug ohne Bezeichnung",
          kennzeichen: fahrzeug.license_plate ?? null,
          baujahr: fahrzeug.year ?? null,
          kilometerstand: fahrzeug.mileage_km ?? null,
          kraftstoff: fahrzeug.fuel_type ?? null,
        }
      : null,
    termin: termin
      ? {
          id: termin.id,
          starts_at: termin.starts_at,
          ends_at: termin.ends_at,
          status: termin.status,
          bay: termin.bay ?? null,
        }
      : null,
  };
}

/**
 * Werkstatt und Benutzer der aktuellen Sitzung.
 *
 * Ohne Supabase-Zugangsdaten liefert die Funktion `nicht_konfiguriert`; die
 * Oberfläche zeigt dann den Setup-Hinweis statt eines Fehlers.
 */
export async function ladeDashboardKontext(): Promise<DashboardKontext> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "nicht_konfiguriert" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "nicht_angemeldet" };

  const { data: profil, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, companies(id, name, slug, city, phone, email, accent_color, slot_minutes, timezone)",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) return { status: "fehler", meldung: error.message };
  if (!profil) return { status: "kein_profil" };

  const firma = alsEinzelobjekt<DashboardFirma>(profil.companies);
  if (!firma) return { status: "kein_profil" };

  return {
    status: "ok",
    firma,
    benutzer: {
      id: user.id,
      name: (profil.full_name as string | null) ?? user.email ?? "Benutzer",
      email: (profil.email as string | null) ?? user.email ?? null,
      rolle: (profil.role as "inhaber" | "mitarbeiter") ?? "inhaber",
    },
  };
}

export type AnfragenLadung =
  | { status: "ok"; anfragen: AnfrageZeile[] }
  | { status: "nicht_konfiguriert" }
  | { status: "nicht_angemeldet" }
  | { status: "kein_profil" }
  | { status: "fehler"; meldung: string };

/**
 * Alle Anfragen der eigenen Werkstatt (die RLS grenzt auf den Mandanten ein).
 *
 * Bewusst ohne Datenbank-Filterung nach Status: die Inbox zeigt den Zähler je
 * Status und filtert in der Oberfläche — bei diesem Datenvolumen pro Werkstatt
 * ist das die einfachere und robustere Variante.
 */
export async function ladeAnfragen(): Promise<AnfragenLadung> {
  const kontext = await ladeDashboardKontext();
  if (kontext.status !== "ok") return kontext;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "nicht_konfiguriert" };

  const { data, error } = await supabase
    .from("requests")
    .select(ANFRAGE_FELDER)
    .eq("company_id", kontext.firma.id)
    .order("created_at", { ascending: false });

  if (error) return { status: "fehler", meldung: error.message };

  return {
    status: "ok",
    anfragen: (data ?? []).map((zeile) =>
      alsAnfrageZeile(zeile as unknown as Record<string, unknown>),
    ),
  };
}

export type EinzelAnfrageLadung =
  | { status: "ok"; anfrage: AnfrageZeile }
  | { status: "nicht_konfiguriert" }
  | { status: "nicht_angemeldet" }
  | { status: "kein_profil" }
  | { status: "nicht_gefunden" }
  | { status: "fehler"; meldung: string };

/**
 * Eine einzelne Anfrage über ihre ID.
 *
 * "nicht_gefunden" ist auch die Antwort für eine Anfrage einer FREMDEN Werkstatt:
 * die RLS liefert die Zeile nicht, also ist sie für diese Sitzung nicht
 * vorhanden. Die Oberfläche zeigt daraufhin eine deutsche 404-Seite (Aufruf von
 * `notFound()`), die keinen Rückschluss auf fremde Daten zulässt.
 */
export async function ladeAnfrage(id: string): Promise<EinzelAnfrageLadung> {
  const kontext = await ladeDashboardKontext();
  if (kontext.status !== "ok") return kontext;

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "nicht_konfiguriert" };

  if (!istUuid(id)) return { status: "nicht_gefunden" };

  const { data, error } = await supabase
    .from("requests")
    .select(ANFRAGE_FELDER)
    .eq("id", id)
    .eq("company_id", kontext.firma.id)
    .maybeSingle();

  if (error) return { status: "fehler", meldung: error.message };
  if (!data) return { status: "nicht_gefunden" };

  return {
    status: "ok",
    anfrage: alsAnfrageZeile(data as unknown as Record<string, unknown>),
  };
}

/** Belegte Zeitfenster der eigenen Werkstatt — Grundlage der Kollisionshinweise. */
export async function ladeBelegteTermine(
  vonIso: string,
  bisIso: string,
): Promise<{ status: "ok"; termine: { starts_at: string; ends_at: string; title: string | null; status: string | null }[] } | { status: "fehler"; meldung: string }> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "fehler", meldung: "Supabase ist nicht konfiguriert." };

  const { data, error } = await supabase
    .from("appointments")
    .select("starts_at, ends_at, title, status")
    .gte("starts_at", vonIso)
    .lte("starts_at", bisIso)
    .in("status", ["geplant", "bestaetigt", "abgeschlossen"])
    .order("starts_at", { ascending: true });

  if (error) return { status: "fehler", meldung: error.message };

  return {
    status: "ok",
    termine: (data ?? []).map((zeile) => ({
      starts_at: zeile.starts_at as string,
      ends_at: zeile.ends_at as string,
      title: (zeile.title ?? null) as string | null,
      status: (zeile.status ?? null) as string | null,
    })),
  };
}

/**
 * Anzahl unbearbeiteter Anfragen ("neu") der eigenen Werkstatt — für das
 * Zählerzeichen in der Navigation. Bewusst eine leichte Zählabfrage
 * (kopf-only), damit jede Dashboard-Seite sie mitladen kann.
 */
export async function zaehleOffeneAnfragen(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from("requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "neu");

  if (error) return 0;
  return count ?? 0;
}

function istUuid(wert: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wert);
}
