/**
 * Zentrale Stelle für alle Umgebungsvariablen.
 *
 * Wichtig: Fehlt eine Variable, darf die Anwendung NICHT abstürzen oder einen
 * weißen Bildschirm zeigen. Stattdessen liefern die Helfer hier `null`/`false`,
 * und die Oberfläche zeigt einen deutschen Hinweis, was zu tun ist
 * (siehe src/components/setup-hinweis.tsx).
 */

/** Öffentliche Variablen (werden in den Browser eingebettet). */
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
export const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

/** Name der Plattform — erscheint in der Oberfläche. */
export const appName =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "WerkstattFlow";

/** Öffentliche Basis-URL (für Links in E-Mails). */
export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

/** Serverseitige Variablen (nie an den Browser senden). */
export const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

export const resendApiKey = process.env.RESEND_API_KEY?.trim() ?? "";
export const emailFrom = process.env.EMAIL_FROM?.trim() ?? "";

export const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";
export const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
export const twilioFromNumber = process.env.TWILIO_FROM_NUMBER?.trim() ?? "";

/**
 * Ist Supabase verbunden? Nur dann sind Login, Registrierung und Dashboard
 * benutzbar.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/** Variablen, die fehlen, damit Supabase läuft — für den Hinweistext. */
export const missingSupabaseVariables = [
  !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
  !supabaseAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
].filter((value): value is string => value !== null);
