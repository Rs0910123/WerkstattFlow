import type { NextRequest } from "next/server";

import { aktualisiereSitzung } from "@/lib/supabase/middleware";

/**
 * Middleware: schützt /dashboard.
 *
 * Ohne Anmeldung wird auf /login umgeleitet (mit Ziel-Parameter "weiter").
 */
export async function middleware(request: NextRequest) {
  return aktualisiereSitzung(request);
}

export const config = {
  matcher: [
    /*
     * Alles außer:
     *  - _next/static, _next/image (Build-Dateien)
     *  - favicon
     *  - Bilddateien
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
