"use client";

import { createBrowserClient } from "@supabase/ssr";

import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/env";

/**
 * Supabase-Client für den Browser.
 *
 * Gibt `null` zurück, solange Supabase nicht verbunden ist. Aufrufer zeigen
 * dann einen deutschen Hinweis statt eines weißen Fehlerbildschirms.
 */
export function createSupabaseBrowserClient() {
  if (!isSupabaseConfigured) return null;
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
