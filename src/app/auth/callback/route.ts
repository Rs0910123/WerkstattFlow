import { NextResponse, type NextRequest } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Supabase-Typen für Links aus E-Mails. */
const ERLAUBTE_TYPEN = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
] as const;

type ErlaubterTyp = (typeof ERLAUBTE_TYPEN)[number];

function istErlaubterTyp(wert: string | null): wert is ErlaubterTyp {
  return wert !== null && (ERLAUBTE_TYPEN as readonly string[]).includes(wert);
}

/**
 * Rückkehr-Adresse für Links aus E-Mails (Bestätigung, Passwort zurücksetzen).
 *
 * Unterstützt beide Wege, die Supabase je nach Einstellung nutzt:
 *   ?code=...                     (PKCE — der Standard in dieser App)
 *   ?token_hash=...&type=...      (Bestätigungs-Link aus der E-Mail-Vorlage)
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const typ = searchParams.get("type");
  const weiter = searchParams.get("next") ?? "/dashboard";

  const ziel = weiter.startsWith("/") ? weiter : "/dashboard";
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.redirect(
      `${origin}/login?fehler=${encodeURIComponent(
        "Supabase ist noch nicht verbunden. Bitte die Datei .env.local ausfüllen (siehe README).",
      )}`,
    );
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${ziel}`);
    }
  }

  if (tokenHash && istErlaubterTyp(typ)) {
    const { error } = await supabase.auth.verifyOtp({
      type: typ,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(`${origin}${ziel}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?fehler=${encodeURIComponent(
      "Der Link ist ungültig oder abgelaufen. Bitte fordern Sie einen neuen Link an.",
    )}`,
  );
}
