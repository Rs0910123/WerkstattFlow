import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AnfrageStatus, TerminStatus, Verfuegbarkeit } from "@/types/database";

/** Eine Zeile der Anfragen-Liste im Dashboard. */
export type AnfrageZeile = {
  id: string;
  reference: string;
  status: AnfrageStatus;
  service_type: string;
  description: string | null;
  created_at: string;
  estimated_price_min: number | null;
  estimated_price_max: number | null;
  kunde: { name: string; telefon: string | null; email: string | null } | null;
  fahrzeug: { bezeichnung: string; kennzeichen: string | null } | null;
};

/** Eine Zeile der Termin-Liste im Dashboard. */
export type TerminZeile = {
  id: string;
  titel: string;
  starts_at: string;
  ends_at: string;
  status: TerminStatus;
  bay: string | null;
  kunde: string;
  fahrzeug: string | null;
};

export type DashboardDaten = {
  firma: {
    id: string;
    name: string;
    slug: string;
    city: string | null;
    phone: string | null;
    email: string | null;
    accent_color: string;
    slot_minutes: number;
  };
  benutzer: {
    name: string;
    email: string | null;
    rolle: "inhaber" | "mitarbeiter";
  };
  kennzahlen: {
    offeneAnfragen: number;
    bestaetigteAnfragen: number;
    abgelehnteAnfragen: number;
    abgeschlosseneAnfragen: number;
    kunden: number;
    fahrzeuge: number;
    kommendeTermine: number;
  };
  anfragen: AnfrageZeile[];
  termine: TerminZeile[];
  verfuegbarkeiten: Verfuegbarkeit[];
};

/**
 * Übernommene Fremdtabellen kommen je nach Abfrage als einzelnes Objekt oder
 * als Liste zurück. Dieser Helfer normalisiert beides auf "Objekt oder null".
 */
function alsEinzelobjekt<T>(wert: unknown): T | null {
  if (wert === null || wert === undefined) return null;
  if (Array.isArray(wert)) return (wert[0] as T | undefined) ?? null;
  return wert as T;
}

export type DashboardLadung =
  | { status: "ok"; daten: DashboardDaten }
  | { status: "nicht_konfiguriert" }
  | { status: "nicht_angemeldet" }
  | { status: "kein_profil" }
  | { status: "fehler"; meldung: string };

/**
 * Lädt alles, was das Dashboard der Werkstatt anzeigt.
 *
 * Wichtig: Es wird nirgends nach "allen" Daten gefragt — die Datenbank liefert
 * über die Row-Level-Security ausschließlich die Zeilen des eigenen
 * Unternehmens. Die zusätzlichen company_id-Filter unten sind nur doppelt
 * abgesichert und machen die Absicht im Code sichtbar.
 */
export async function ladeDashboardDaten(): Promise<DashboardLadung> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "nicht_konfiguriert" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "nicht_angemeldet" };

  const { data: profil, error: profilFehler } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, companies(id, name, slug, city, phone, email, accent_color, slot_minutes)",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (profilFehler) {
    return { status: "fehler", meldung: profilFehler.message };
  }
  if (!profil || !profil.companies) {
    return { status: "kein_profil" };
  }

  const firma = alsEinzelobjekt<DashboardDaten["firma"]>(profil.companies);
  if (!firma) return { status: "kein_profil" };

  const zaehle = async (
    tabelle: "requests" | "customers" | "vehicles" | "appointments",
    statusWerte?: AnfrageStatus[] | TerminStatus[],
    abJetzt?: boolean,
  ) => {
    let abfrage = supabase
      .from(tabelle)
      .select("id", { count: "exact", head: true })
      .eq("company_id", firma.id);
    if (statusWerte && statusWerte.length > 0) {
      abfrage = abfrage.in("status", statusWerte);
    }
    if (abJetzt) {
      abfrage = abfrage.gte("starts_at", new Date().toISOString());
    }
    const { count, error } = await abfrage;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  try {
    const [
      offeneAnfragen,
      bestaetigteAnfragen,
      abgelehnteAnfragen,
      abgeschlosseneAnfragen,
      kunden,
      fahrzeuge,
      kommendeTermine,
    ] = await Promise.all([
      zaehle("requests", ["neu"]),
      zaehle("requests", ["bestaetigt"]),
      zaehle("requests", ["abgelehnt"]),
      zaehle("requests", ["abgeschlossen"]),
      zaehle("customers"),
      zaehle("vehicles"),
      zaehle("appointments", ["geplant", "bestaetigt"], true),
    ]);

    const { data: anfragenRoh, error: anfragenFehler } = await supabase
      .from("requests")
      .select(
        "id, reference, status, service_type, description, created_at, estimated_price_min, estimated_price_max, customers(first_name, last_name, phone, email), vehicles(make, model, license_plate)",
      )
      .eq("company_id", firma.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (anfragenFehler) {
      return { status: "fehler", meldung: anfragenFehler.message };
    }

    const { data: termineRoh, error: termineFehler } = await supabase
      .from("appointments")
      .select(
        "id, title, starts_at, ends_at, status, bay, customers(first_name, last_name), vehicles(make, model, license_plate)",
      )
      .eq("company_id", firma.id)
      .order("starts_at", { ascending: true })
      .limit(20);

    if (termineFehler) {
      return { status: "fehler", meldung: termineFehler.message };
    }

    const { data: verfuegbarkeitenRoh, error: verfuegbarkeitenFehler } =
      await supabase
        .from("availabilities")
        .select(
          "id, company_id, weekday, specific_date, is_closed, open_time, close_time, slot_minutes, capacity, note, created_at, updated_at",
        )
        .eq("company_id", firma.id)
        .order("weekday", { ascending: true, nullsFirst: false });

    if (verfuegbarkeitenFehler) {
      return { status: "fehler", meldung: verfuegbarkeitenFehler.message };
    }

    // Die eingebetteten Fremdtabellen kommen als beliebig typisierte Objekte
    // zurück; hier werden sie in die Anzeigetypen überführt.
    const anfragen: AnfrageZeile[] = (anfragenRoh ?? []).map((zeile) => {
      const kunde = alsEinzelobjekt<{
        first_name: string;
        last_name: string;
        phone: string | null;
        email: string | null;
      }>(zeile.customers);
      const fahrzeug = alsEinzelobjekt<{
        make: string;
        model: string;
        license_plate: string | null;
      }>(zeile.vehicles);

      return {
        id: zeile.id as string,
        reference: zeile.reference as string,
        status: zeile.status as AnfrageStatus,
        service_type: zeile.service_type as string,
        description: (zeile.description ?? null) as string | null,
        created_at: zeile.created_at as string,
        estimated_price_min: (zeile.estimated_price_min ?? null) as number | null,
        estimated_price_max: (zeile.estimated_price_max ?? null) as number | null,
        kunde: kunde
          ? {
              name: `${kunde.first_name} ${kunde.last_name}`.trim(),
              telefon: kunde.phone,
              email: kunde.email,
            }
          : null,
        fahrzeug: fahrzeug
          ? {
              bezeichnung: `${fahrzeug.make} ${fahrzeug.model}`.trim(),
              kennzeichen: fahrzeug.license_plate,
            }
          : null,
      };
    });

    const termine: TerminZeile[] = (termineRoh ?? []).map((zeile) => {
      const kunde = alsEinzelobjekt<{
        first_name: string;
        last_name: string;
      }>(zeile.customers);
      const fahrzeug = alsEinzelobjekt<{
        make: string;
        model: string;
        license_plate: string | null;
      }>(zeile.vehicles);

      return {
        id: zeile.id as string,
        titel: (zeile.title ?? "Termin") as string,
        starts_at: zeile.starts_at as string,
        ends_at: zeile.ends_at as string,
        status: zeile.status as TerminStatus,
        bay: (zeile.bay ?? null) as string | null,
        kunde: kunde
          ? `${kunde.first_name} ${kunde.last_name}`.trim()
          : "Ohne Kundenzuordnung",
        fahrzeug: fahrzeug
          ? `${fahrzeug.make} ${fahrzeug.model}`.trim() +
            (fahrzeug.license_plate ? ` (${fahrzeug.license_plate})` : "")
          : null,
      };
    });

    return {
      status: "ok",
      daten: {
        firma,
        benutzer: {
          name: (profil.full_name as string | null) ?? user.email ?? "Benutzer",
          email: (profil.email as string | null) ?? user.email ?? null,
          rolle: profil.role as "inhaber" | "mitarbeiter",
        },
        kennzahlen: {
          offeneAnfragen,
          bestaetigteAnfragen,
          abgelehnteAnfragen,
          abgeschlosseneAnfragen,
          kunden,
          fahrzeuge,
          kommendeTermine,
        },
        anfragen,
        termine,
        verfuegbarkeiten: (verfuegbarkeitenRoh ?? []) as Verfuegbarkeit[],
      },
    };
  } catch (fehler) {
    return {
      status: "fehler",
      meldung:
        fehler instanceof Error
          ? fehler.message
          : "Die Daten konnten nicht geladen werden.",
    };
  }
}
