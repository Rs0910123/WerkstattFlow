import "server-only";

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Supabase-Client für Server-Komponenten, Server-Actions und Route-Handler.
 *
 * Gibt `null` zurück, solange Supabase nicht verbunden ist — die Oberfläche
 * zeigt dann den Hinweis aus src/components/setup-hinweis.tsx.
 */
export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured) return null;

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(
        cookiesToSet: { name: string; value: string; options: CookieOptions }[],
      ) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // In Server-Komponenten dürfen Cookies nicht geschrieben werden.
          // Das ist unkritisch: die Middleware frischt die Sitzung auf.
        }
      },
    },
  });
}

/** Der angemeldete Benutzer oder `null`. */
export async function getAngemeldeterBenutzer() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
