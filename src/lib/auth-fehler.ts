/**
 * Übersetzt technische Meldungen von Supabase Auth in verständliches Deutsch.
 *
 * Absichtlich in einer eigenen Datei: In einer "use server"-Datei dürfen nur
 * async-Funktionen exportiert werden.
 */
export function uebersetzeAuthFehler(meldung?: string | null): string {
  const text = (meldung ?? "").toLowerCase();

  if (text.includes("invalid login credentials")) {
    return "E-Mail-Adresse oder Passwort ist nicht korrekt.";
  }
  if (text.includes("email not confirmed")) {
    return "Ihre E-Mail-Adresse ist noch nicht bestätigt. Bitte prüfen Sie Ihr Postfach.";
  }
  if (text.includes("user already registered")) {
    return "Für diese E-Mail-Adresse gibt es bereits ein Konto. Bitte melden Sie sich an.";
  }
  if (text.includes("password should be at least")) {
    return "Das Passwort ist zu kurz. Bitte verwenden Sie mindestens 8 Zeichen.";
  }
  if (text.includes("rate limit") || text.includes("too many")) {
    return "Zu viele Versuche in kurzer Zeit. Bitte warten Sie einige Minuten.";
  }
  if (text.includes("unable to validate email") || text.includes("invalid email")) {
    return "Diese E-Mail-Adresse wird nicht akzeptiert. Bitte prüfen Sie die Schreibweise.";
  }
  if (text.includes("signups not allowed")) {
    return "Neue Registrierungen sind derzeit deaktiviert. Bitte wenden Sie sich an den Betreiber.";
  }
  if (text.includes("fetch failed") || text.includes("failed to fetch")) {
    return "Die Verbindung zum Server ist fehlgeschlagen. Bitte prüfen Sie Ihre Internetverbindung.";
  }
  if (text.includes("invalid api key") || text.includes("no api key")) {
    return "Die Zugangsdaten zu Supabase stimmen nicht. Bitte prüfen Sie die Werte in .env.local.";
  }
  if (text.includes("email address not authorized")) {
    return "Diese E-Mail-Adresse ist für den Versand nicht freigegeben. Bitte wenden Sie sich an den Betreiber.";
  }
  return "Das hat leider nicht funktioniert. Bitte versuchen Sie es erneut.";
}

