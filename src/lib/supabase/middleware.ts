import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";

/** Bereiche, die nur nach dem Login erreichbar sind. */
const GESCHUETZTE_BEREICHE = ["/dashboard"];

/** Seiten, die für Angemeldete keinen Sinn ergeben. */
const NUR_FUER_GAESTE = [
  "/login",
  "/registrieren",
  "/passwort-vergessen",
];

export function istGeschuetzterPfad(pfadname: string) {
  return GESCHUETZTE_BEREICHE.some(
    (bereich) => pfadname === bereich || pfadname.startsWith(`${bereich}/`),
  );
}

/**
 * Frischt die Supabase-Sitzung auf und schützt die Dashboard-Bereiche.
 *
 * Fehlt die Supabase-Konfiguration, wird nichts umgeleitet: Die Seiten zeigen
 * selbst einen deutschen Hinweis, was zu tun ist.
 */
export async function aktualisiereSitzung(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Achtung: getUser() muss aufgerufen werden, damit die Session aufgefrischt
  // wird. getUser() liefert zusätzlich die aktuelle Sitzung.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pfadname = request.nextUrl.pathname;

  if (!user && istGeschuetzterPfad(pfadname)) {
    const weiter = `${pfadname}${request.nextUrl.search}`;
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("weiter", weiter);
    loginUrl.searchParams.set(
      "hinweis",
      "Bitte melden Sie sich an, um fortzufahren.",
    );
    return NextResponse.redirect(loginUrl);
  }

  if (user && NUR_FUER_GAESTE.includes(pfadname)) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}
