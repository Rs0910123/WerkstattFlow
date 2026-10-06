"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Auffangseite für unerwartete Fehler.
 *
 * Statt eines weißen Bildschirms bekommt der Benutzer eine deutsche Erklärung
 * und einen Weg zurück.
 */
export default function FehlerSeite({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unerwarteter Fehler:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-semibold">Da ist etwas schiefgelaufen</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Die Seite konnte nicht geladen werden. Das kann an einer fehlenden
          Verbindung zu Supabase liegen — prüfen Sie in diesem Fall die Werte in
          Ihrer <code className="rounded bg-muted px-1">.env.local</code> (siehe
          README).
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-muted-foreground">
            Fehlercode für die Fehlersuche: {error.digest}
          </p>
        )}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button onClick={reset}>Erneut versuchen</Button>
          <Button asChild variant="outline">
            <Link href="/">Zur Startseite</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
