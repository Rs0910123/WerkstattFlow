"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { uebersetzeAuthFehler } from "@/lib/auth-fehler";
import { siteUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Was ein Formular nach dem Absenden zurückbekommt. */
export type AuthFormularStatus = {
  fehler?: string;
  erfolg?: string;
  /** Rohdaten für die Fehlermeldung des Registrierungsformulars. */
  eingaben?: Record<string, string>;
};

/** Basis-URL der laufenden Instanz (für Links in E-Mails). */
async function holeBasisUrl(): Promise<string> {
  const kopfzeilen = await headers();
  const host = kopfzeilen.get("x-forwarded-host") ?? kopfzeilen.get("host");
  if (!host) return siteUrl;
  const protokoll = kopfzeilen.get("x-forwarded-proto") ?? "http";
  return `${protokoll}://${host}`;
}

const emailFeld = z
  .string()
  .trim()
  .min(1, "Bitte geben Sie Ihre E-Mail-Adresse ein.")
  .email("Bitte geben Sie eine gültige E-Mail-Adresse ein.");

const passwortFeld = z
  .string()
  .min(8, "Das Passwort muss mindestens 8 Zeichen lang sein.");

const registrierungSchema = z.object({
  company_name: z
    .string()
    .trim()
    .min(2, "Bitte geben Sie den Namen Ihrer Werkstatt ein."),
  full_name: z
    .string()
    .trim()
    .min(2, "Bitte geben Sie Ihren Namen ein."),
  email: emailFeld,
  password: passwortFeld,
  password_wiederholung: z.string(),
});

const loginSchema = z.object({
  email: emailFeld,
  password: z.string().min(1, "Bitte geben Sie Ihr Passwort ein."),
});

/** Fehlermeldung des Formulars für ungültige Eingaben. */
function ersteZodMeldung(fehler: z.ZodError): string {
  return fehler.issues[0]?.message ?? "Bitte prüfen Sie Ihre Eingaben.";
}

/**
 * Registrierung einer Werkstatt.
 *
 * Das Unternehmen (der Mandant) entsteht automatisch in der Datenbank: Die
 * Werte company_name und full_name gehen als Metadaten mit und werden vom
 * Trigger public.handle_new_user() ausgewertet (Migration 3).
 */
export async function registrierenAction(
  _vorher: AuthFormularStatus,
  formular: FormData,
): Promise<AuthFormularStatus> {
  const eingaben = {
    company_name: String(formular.get("company_name") ?? ""),
    full_name: String(formular.get("full_name") ?? ""),
    email: String(formular.get("email") ?? ""),
  };

  const geprueft = registrierungSchema.safeParse({
    ...eingaben,
    password: String(formular.get("password") ?? ""),
    password_wiederholung: String(formular.get("password_wiederholung") ?? ""),
  });

  if (!geprueft.success) {
    return { fehler: ersteZodMeldung(geprueft.error), eingaben };
  }

  if (geprueft.data.password !== geprueft.data.password_wiederholung) {
    return {
      fehler: "Die beiden Passwörter stimmen nicht überein.",
      eingaben,
    };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      fehler:
        "Supabase ist noch nicht verbunden. Bitte die Datei .env.local ausfüllen (siehe README).",
      eingaben,
    };
  }

  const basisUrl = await holeBasisUrl();

  const { data, error } = await supabase.auth.signUp({
    email: geprueft.data.email,
    password: geprueft.data.password,
    options: {
      data: {
        company_name: geprueft.data.company_name,
        full_name: geprueft.data.full_name,
      },
      emailRedirectTo: `${basisUrl}/auth/callback`,
    },
  });

  if (error) {
    return { fehler: uebersetzeAuthFehler(error.message), eingaben };
  }

  // Ist die E-Mail-Bestätigung im Supabase-Projekt aktiv, gibt es noch keine
  // Sitzung — dann bitten wir um den Klick in der Bestätigungsmail.
  if (!data.session) {
    return {
      erfolg:
        "Ihre Werkstatt wurde angelegt. Bitte bestätigen Sie jetzt die E-Mail, die wir Ihnen geschickt haben — danach können Sie sich anmelden.",
      eingaben,
    };
  }

  redirect("/dashboard");
}

/** Anmeldung einer Werkstatt. */
export async function anmeldenAction(
  _vorher: AuthFormularStatus,
  formular: FormData,
): Promise<AuthFormularStatus> {
  const weiter = String(formular.get("weiter") ?? "");

  const geprueft = loginSchema.safeParse({
    email: String(formular.get("email") ?? ""),
    password: String(formular.get("password") ?? ""),
  });

  if (!geprueft.success) {
    return { fehler: ersteZodMeldung(geprueft.error) };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      fehler:
        "Supabase ist noch nicht verbunden. Bitte die Datei .env.local ausfüllen (siehe README).",
    };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: geprueft.data.email,
    password: geprueft.data.password,
  });

  if (error) {
    return { fehler: uebersetzeAuthFehler(error.message) };
  }

  redirect(weiter.startsWith("/") ? weiter : "/dashboard");
}

/** Abmeldung. Wird von einem Formular im Dashboard aufgerufen. */
export async function abmeldenAction() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect("/login");
}

/**
 * Passwort vergessen: verschickt einen Link zum Zurücksetzen.
 *
 * Aus Sicherheitsgründen wird immer dieselbe Erfolgsmeldung gezeigt — so lässt
 * sich nicht herausfinden, welche E-Mail-Adressen registriert sind.
 */
export async function passwortVergessenAction(
  _vorher: AuthFormularStatus,
  formular: FormData,
): Promise<AuthFormularStatus> {
  const geprueft = emailFeld.safeParse(String(formular.get("email") ?? ""));

  if (!geprueft.success) {
    return { fehler: ersteZodMeldung(geprueft.error) };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      fehler:
        "Supabase ist noch nicht verbunden. Bitte die Datei .env.local ausfüllen (siehe README).",
    };
  }

  const basisUrl = await holeBasisUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(
    geprueft.data,
    {
      redirectTo: `${basisUrl}/auth/callback?next=/passwort-zuruecksetzen`,
    },
  );

  if (error) {
    return { fehler: uebersetzeAuthFehler(error.message) };
  }

  return {
    erfolg:
      "Wenn es zu dieser E-Mail-Adresse ein Konto gibt, ist jetzt eine E-Mail mit einem Link zum Zurücksetzen unterwegs. Bitte prüfen Sie auch den Spam-Ordner.",
  };
}

const neuesPasswortSchema = z
  .object({
    password: passwortFeld,
    password_wiederholung: z.string(),
  })
  .refine((werte) => werte.password === werte.password_wiederholung, {
    message: "Die beiden Passwörter stimmen nicht überein.",
    path: ["password_wiederholung"],
  });

/** Neues Passwort setzen (nach Klick auf den Link aus der E-Mail). */
export async function neuesPasswortAction(
  _vorher: AuthFormularStatus,
  formular: FormData,
): Promise<AuthFormularStatus> {
  const geprueft = neuesPasswortSchema.safeParse({
    password: String(formular.get("password") ?? ""),
    password_wiederholung: String(formular.get("password_wiederholung") ?? ""),
  });

  if (!geprueft.success) {
    return { fehler: ersteZodMeldung(geprueft.error) };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return {
      fehler:
        "Supabase ist noch nicht verbunden. Bitte die Datei .env.local ausfüllen (siehe README).",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: geprueft.data.password,
  });

  if (error) {
    return { fehler: uebersetzeAuthFehler(error.message) };
  }

  redirect("/dashboard");
}
