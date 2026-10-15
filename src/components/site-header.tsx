import Link from "next/link";
import { Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { appName } from "@/lib/env";

/** Kopfzeile der öffentlichen Seiten. */
export function SiteHeader() {
  return (
    <header className="border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-brand-fg">
            <Wrench className="h-5 w-5" />
          </span>
          <span className="text-lg">{appName}</span>
        </Link>

        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/login">Anmelden</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/registrieren">Werkstatt registrieren</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

/** Fußzeile der öffentlichen Seiten. */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/70 py-8">
      <div className="container flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {appName} — Termin- und Auftragsanfragen
          für Kfz-Werkstätten.
        </p>
        <p>Oberfläche auf Deutsch. Daten jeder Werkstatt bleiben getrennt.</p>
      </div>
    </footer>
  );
}
