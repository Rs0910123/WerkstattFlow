import Link from "next/link";
import { Wrench } from "lucide-react";

import { appName } from "@/lib/env";

/** Gemeinsames Layout für Anmelden, Registrieren und Passwort-Zurücksetzen. */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b border-border/70 bg-background">
        <div className="container flex h-16 items-center">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-brand-fg">
              <Wrench className="h-5 w-5" />
            </span>
            <span className="text-lg">{appName}</span>
          </Link>
        </div>
      </header>

      <main className="container flex flex-1 items-start justify-center py-10 sm:py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="border-t border-border/70 py-6">
        <p className="container text-center text-xs text-muted-foreground">
          {appName} — jede Werkstatt sieht ausschließlich ihre eigenen Daten.
        </p>
      </footer>
    </div>
  );
}
