"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Inbox, LayoutDashboard, Settings } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Navigation des Werkstatt-Dashboards.
 *
 * "Anfragen" ist der Bereich aus Baustein 3, Teil A. Kalender und Einstellungen
 * gehören zu Teil B: sie sind hier schon sichtbar, aber als "(folgt)" markiert
 * und noch nicht verlinkt — so ist die Navigation vollständig und Teil B muss
 * nur noch die Ziele nachtragen.
 */
export function DashboardNav({ offeneAnfragen }: { offeneAnfragen?: number }) {
  const pfad = usePathname() ?? "";
  const aktiverBereich = pfad.startsWith("/dashboard/anfragen")
    ? "anfragen"
    : "uebersicht";

  const eintraege = [
    {
      bereich: "uebersicht",
      href: "/dashboard",
      label: "Übersicht",
      icon: LayoutDashboard,
    },
    {
      bereich: "anfragen",
      href: "/dashboard/anfragen",
      label: "Anfragen",
      icon: Inbox,
    },
  ] as const;

  return (
    <nav
      aria-label="Bereiche des Dashboards"
      className="border-b border-border/70 bg-background"
    >
      <div className="container flex flex-wrap items-center gap-1 py-2">
        {eintraege.map((eintrag) => {
          const Icon = eintrag.icon;
          const istAktiv = eintrag.bereich === aktiverBereich;
          return (
            <Link
              key={eintrag.bereich}
              href={eintrag.href}
              aria-current={istAktiv ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                istAktiv
                  ? "bg-brand-soft text-brand"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {eintrag.label}
              {eintrag.bereich === "anfragen" &&
                typeof offeneAnfragen === "number" &&
                offeneAnfragen > 0 && (
                  <Badge variant="neu" className="ml-1">
                    {offeneAnfragen}
                  </Badge>
                )}
            </Link>
          );
        })}

        {[
          { label: "Kalender", icon: CalendarDays },
          { label: "Einstellungen", icon: Settings },
        ].map(({ label, icon: Icon }) => (
          <span
            key={label}
            title="Folgt in Baustein 3, Teil B"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground/60"
          >
            <Icon className="h-4 w-4" />
            {label}
            <span className="text-xs font-normal">(folgt)</span>
          </span>
        ))}
      </div>
    </nav>
  );
}
