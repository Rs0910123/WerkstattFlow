/**
 * Datenbanktypen für die gesamte Anwendung.
 *
 * Diese Datei ist handgepflegt und spiegelt die Migrationen in
 * supabase/migrations/ wider. Sobald ein Supabase-Projekt verbunden ist, kann
 * sie jederzeit neu erzeugt werden:
 *
 *     npm run db:types        (supabase gen types typescript --local)
 */
export interface Database {
  public: {
    Tables: {
      companies: {
        Row: {
          id: string;
          name: string;
          slug: string;
          legal_name: string | null;
          email: string | null;
          phone: string | null;
          street: string | null;
          postal_code: string | null;
          city: string | null;
          country: string;
          accent_color: string;
          timezone: string;
          slot_minutes: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          company_id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          role: "inhaber" | "mitarbeiter";
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      customers: {
        Row: {
          id: string;
          company_id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          street: string | null;
          postal_code: string | null;
          city: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      vehicles: {
        Row: {
          id: string;
          company_id: string;
          customer_id: string;
          make: string;
          model: string;
          year: number | null;
          license_plate: string | null;
          vin: string | null;
          mileage_km: number | null;
          fuel_type: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      requests: {
        Row: {
          id: string;
          company_id: string;
          customer_id: string;
          vehicle_id: string | null;
          reference: string;
          public_token: string;
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
          source: "online" | "telefon" | "vor_ort" | "sms_webhook";
          staff_note: string | null;
          rejection_reason: string | null;
          decided_at: string | null;
          decided_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      appointments: {
        Row: {
          id: string;
          company_id: string;
          request_id: string | null;
          customer_id: string;
          vehicle_id: string | null;
          title: string | null;
          starts_at: string;
          ends_at: string;
          status: TerminStatus;
          bay: string | null;
          internal_note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
      };
      files: {
        Row: {
          id: string;
          company_id: string;
          request_id: string | null;
          appointment_id: string | null;
          vehicle_id: string | null;
          customer_id: string | null;
          uploaded_by: string | null;
          bucket_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          size_bytes: number | null;
          kind: "foto" | "dokument" | "rechnung" | "gutachten" | "sonstiges";
          is_customer_visible: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      availabilities: {
        Row: {
          id: string;
          company_id: string;
          weekday: number | null;
          specific_date: string | null;
          is_closed: boolean;
          open_time: string | null;
          close_time: string | null;
          slot_minutes: number | null;
          capacity: number;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
      };
    };
  };
}

/** Status einer Anfrage — entspricht dem CHECK-Constraint in der Datenbank. */
export type AnfrageStatus =
  | "neu"
  | "bestaetigt"
  | "abgelehnt"
  | "abgeschlossen"
  | "storniert";

/** Status eines Termins. */
export type TerminStatus =
  | "geplant"
  | "bestaetigt"
  | "abgeschlossen"
  | "abgesagt"
  | "nicht_erschienen";

export type Firma = Database["public"]["Tables"]["companies"]["Row"];
export type Profil = Database["public"]["Tables"]["profiles"]["Row"];
export type Kunde = Database["public"]["Tables"]["customers"]["Row"];
export type Fahrzeug = Database["public"]["Tables"]["vehicles"]["Row"];
export type Anfrage = Database["public"]["Tables"]["requests"]["Row"];
export type Termin = Database["public"]["Tables"]["appointments"]["Row"];
export type Datei = Database["public"]["Tables"]["files"]["Row"];
export type Verfuegbarkeit =
  Database["public"]["Tables"]["availabilities"]["Row"];

/** Deutsche Beschriftungen für die Statuswerte. */
export const STATUS_BESCHRIFTUNG: Record<AnfrageStatus, string> = {
  neu: "Neu",
  bestaetigt: "Bestätigt",
  abgelehnt: "Abgelehnt",
  abgeschlossen: "Abgeschlossen",
  storniert: "Storniert",
};

export const TERMIN_STATUS_BESCHRIFTUNG: Record<TerminStatus, string> = {
  geplant: "Geplant",
  bestaetigt: "Bestätigt",
  abgeschlossen: "Abgeschlossen",
  abgesagt: "Abgesagt",
  nicht_erschienen: "Nicht erschienen",
};

/** Wochentage nach ISO-8601: 1 = Montag ... 7 = Sonntag. */
export const WOCHENTAGE: Record<number, string> = {
  1: "Montag",
  2: "Dienstag",
  3: "Mittwoch",
  4: "Donnerstag",
  5: "Freitag",
  6: "Samstag",
  7: "Sonntag",
};
