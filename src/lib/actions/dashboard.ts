"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ladeAnfrage } from "@/lib/dashboard/daten";
import { uebersetzeDashboardFehler } from "@/lib/dashboard/fehler";
import {
  pruefeUebergang,
  pruefeTerminEingabe,
  type VorgangAktion,
} from "@/lib/dashboard/anfragen";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Server Actions des Werkstatt-Dashboards (Baustein 3, Teil A).
 *
 * Jede Aktion läuft ZWEI Prüfungen:
 *   1. in der Oberfläche (Statusübergang, Pflichtfelder, Terminformat) —
 *      schnelle, verständliche deutsche Meldung;
 *   2. in der Datenbank (Migration 20260101000500) — die endgültige,
 *      transaktionale Entscheidung inklusive Kollisionsprüfung und RLS.
 *
 * Die Datenbankprüfung ist die maßgebliche: die Oberfläche kann veralten
 * (zwei Browserfenster), die Funktionen in Postgres nicht.
 */

export type AktionsZustand =
  | { status: "ruhe" }
  | { status: "fehler"; meldung: string };

const SUPABASE_FEHLT =
  "Supabase ist noch nicht verbunden. Bitte die Werte in .env.local eintragen (siehe README) und die Anwendung neu starten.";

function text(formData: FormData, feld: string): string {
  const wert = formData.get(feld);
  return typeof wert === "string" ? wert.trim() : "";
}

/** Nach einer erfolgreichen Aktion zurück auf die Detailansicht. */
function zurueckZurAnfrage(anfrageId: string, hinweis: VorgangAktion | string): never {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/anfragen");
  revalidatePath(`/dashboard/anfragen/${anfrageId}`);
  redirect(`/dashboard/anfragen/${anfrageId}?erfolg=${encodeURIComponent(hinweis)}`);
}

/** Bestätigen: Termin wählen, Kollision prüfen, Status wechseln (transaktional). */
export async function bestaetigeAnfrageAction(
  _vorher: AktionsZustand,
  formData: FormData,
): Promise<AktionsZustand> {
  const anfrageId = text(formData, "anfrage_id");
  const datum = text(formData, "termin_datum");
  const uhrzeit = text(formData, "termin_uhrzeit");
  const dauerRoh = Number(text(formData, "termin_dauer"));
  const bay = text(formData, "termin_bay");
  const notiz = text(formData, "termin_notiz");

  if (!anfrageId) {
    return { status: "fehler", meldung: "Die Anfrage konnte nicht bestimmt werden." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "fehler", meldung: SUPABASE_FEHLT };

  const ladung = await ladeAnfrage(anfrageId);
  if (ladung.status !== "ok") {
    return {
      status: "fehler",
      meldung:
        ladung.status === "nicht_gefunden"
          ? "Diese Anfrage gehört nicht zu Ihrer Werkstatt oder existiert nicht mehr."
          : "Die Anfrage konnte nicht geladen werden.",
    };
  }

  const anfrage = ladung.anfrage;
  const uebergang = pruefeUebergang(anfrage.status, "bestaetigt");
  if (!uebergang.erlaubt) {
    return { status: "fehler", meldung: uebergang.meldung ?? "Nicht möglich." };
  }

  const dauer = Number.isFinite(dauerRoh) && dauerRoh > 0 ? dauerRoh : 60;
  const vorpruefung = pruefeTerminEingabe({
    datum,
    uhrzeit,
    dauerMinuten: dauer,
    termine: anfrage.termin ? [anfrage.termin] : [],
    zeitzone: "Europe/Berlin",
  });
  if (!vorpruefung.ok) return { status: "fehler", meldung: vorpruefung.meldung };

  // Endgültige Prüfung und beide Schreibvorgänge in EINER Transaktion.
  const { error } = await supabase.rpc("confirm_request", {
    p_request_id: anfrageId,
    p_date: datum,
    p_time: uhrzeit,
    p_duration_minutes: dauer,
    p_bay: bay === "" ? null : bay,
    p_staff_note: notiz === "" ? null : notiz,
  });

  if (error) return { status: "fehler", meldung: uebersetzeDashboardFehler(error) };

  zurueckZurAnfrage(anfrageId, "bestaetigen");
  return { status: "ruhe" };
}

/** Ablehnen: Pflicht-Begründung, Statuswechsel auf "abgelehnt". */
export async function lehneAnfrageAction(
  _vorher: AktionsZustand,
  formData: FormData,
): Promise<AktionsZustand> {
  const anfrageId = text(formData, "anfrage_id");
  const begruendung = text(formData, "begruendung");

  if (!anfrageId) {
    return { status: "fehler", meldung: "Die Anfrage konnte nicht bestimmt werden." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "fehler", meldung: SUPABASE_FEHLT };

  if (begruendung.length < 5) {
    return {
      status: "fehler",
      meldung:
        "Bitte geben Sie eine Begründung an (mindestens 5 Zeichen) — der Kunde sieht sie auf seiner Statusseite.",
    };
  }

  const ladung = await ladeAnfrage(anfrageId);
  if (ladung.status !== "ok") {
    return {
      status: "fehler",
      meldung:
        ladung.status === "nicht_gefunden"
          ? "Diese Anfrage gehört nicht zu Ihrer Werkstatt oder existiert nicht mehr."
          : "Die Anfrage konnte nicht geladen werden.",
    };
  }

  const uebergang = pruefeUebergang(ladung.anfrage.status, "abgelehnt");
  if (!uebergang.erlaubt) {
    return { status: "fehler", meldung: uebergang.meldung ?? "Nicht möglich." };
  }

  const { error } = await supabase.rpc("reject_request", {
    p_request_id: anfrageId,
    p_reason: begruendung,
  });

  if (error) return { status: "fehler", meldung: uebersetzeDashboardFehler(error) };

  zurueckZurAnfrage(anfrageId, "ablehnen");
  return { status: "ruhe" };
}

/** Abschließen oder stornieren (fachlich sinnvolle Übergänge, siehe Logikschicht). */
export async function setzeAnfrageStatusAction(
  _vorher: AktionsZustand,
  formData: FormData,
): Promise<AktionsZustand> {
  const anfrageId = text(formData, "anfrage_id");
  const ziel = text(formData, "ziel_status");

  if (!anfrageId) {
    return { status: "fehler", meldung: "Die Anfrage konnte nicht bestimmt werden." };
  }
  if (ziel !== "abgeschlossen" && ziel !== "storniert") {
    return { status: "fehler", meldung: "Unbekannter Zielstatus." };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "fehler", meldung: SUPABASE_FEHLT };

  const ladung = await ladeAnfrage(anfrageId);
  if (ladung.status !== "ok") {
    return {
      status: "fehler",
      meldung:
        ladung.status === "nicht_gefunden"
          ? "Diese Anfrage gehört nicht zu Ihrer Werkstatt oder existiert nicht mehr."
          : "Die Anfrage konnte nicht geladen werden.",
    };
  }

  const uebergang = pruefeUebergang(
    ladung.anfrage.status,
    ziel === "abgeschlossen" ? "abgeschlossen" : "storniert",
  );
  if (!uebergang.erlaubt) {
    return { status: "fehler", meldung: uebergang.meldung ?? "Nicht möglich." };
  }

  const { error } = await supabase.rpc("set_request_status", {
    p_request_id: anfrageId,
    p_status: ziel,
  });

  if (error) return { status: "fehler", meldung: uebersetzeDashboardFehler(error) };

  zurueckZurAnfrage(anfrageId, ziel);
  return { status: "ruhe" };
}
