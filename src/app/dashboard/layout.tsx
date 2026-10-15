import Link from "next/link";
import { LogOut, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { abmeldenAction } from "@/lib/actions/auth";
import { appName } from "@/lib/env";
import { getAngemeldeterBenutzer } from "@/lib/supabase/server";

// Dieser Bereich hängt an der angemeldeten Sitzung und darf niemals
// vorgerendert werden.
export const dynamic = "force-dynamic";

/** Rahmen des geschützten Dashboard-Bereichs. */
export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const benutzer = await getAngemeldeterBenutzer();

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      <header className="border-b border-border/70 bg-background">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold tracking-tight"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand text-brand-fg">
              <Wrench className="h-5 w-5" />
            </span>
            <span className="text-lg">{appName}</span>
          </Link>

          <div className="flex items-center gap-3">
            {benutzer?.email && (
              <span className="hidden text-sm text-muted-foreground sm:inline">
                {benutzer.email}
              </span>
            )}
            <form action={abmeldenAction}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut className="h-4 w-4" />
                Abmelden
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main className="container flex-1 py-8 sm:py-10">{children}</main>

      <footer className="border-t border-border/70 py-6">
        <p className="container text-xs text-muted-foreground">
          {appName} — Sie sehen ausschließlich Daten Ihrer eigenen Werkstatt.
        </p>
      </footer>
    </div>
  );
}
