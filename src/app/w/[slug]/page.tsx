import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Clock, Mail, MapPin, Phone } from "lucide-react";

import { SetupHinweis } from "@/components/setup-hinweis";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";
import { ladeOeffentlicheWerkstatt } from "@/lib/portal/daten.ts";
import { hexZuHslTriplett, hexZuWeichemTriplett } from "@/lib/portal/farbe.ts";
import { formatiereDatum } from "@/lib/portal/format.ts";
import { LEISTUNGSARTEN } from "@/lib/portal/leistungen.ts";
import { formatierePreisAb } from "@/lib/portal/preisschaetzung.ts";

import { Kalender, NaechsteFreieTage } from "./kalender";
import { TerminFlow } from "./termin-flow";

/**
 * Öffentliche Seite einer Werkstatt: /w/<slug>
 *
 * Sie ist die Einstiegsseite für Kundinnen und Kunden. Sie liest ausschließlich
 * über den öffentlichen Datenzugriffspfad (src/lib/portal/daten.ts) — kein
 * Tabellenzugriff, kein Zugang zu Daten anderer Werkstätten.
 *
 * Ist Supabase nicht verbunden, erscheint ein deutscher Hinweis; ist der Slug
 * unbekannt, eine saubere 404-Seite. In beiden Fällen gibt es keinen
 * Fehlerbildschirm und keine Daten aus anderen Werkstätten.
 */

export const dynamic = "force-dynamic";

export default async function WerkstattSeite({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  if (!isSupabaseConfigured) {
    return (
      <>
        <SiteHeader />
        <main className="container flex-1 py-16">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold">Kundenportal</h1>
            <SetupHinweis kontext="Die öffentliche Werkstattseite mit dem Kalender steht bereit." />
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  const werkstatt = await ladeOeffentlicheWerkstatt(slug);
  if (!werkstatt) notFound();

  const stil = {
    "--brand": hexZuHslTriplett(werkstatt.akzentfarbe),
    "--brand-soft": hexZuWeichemTriplett(werkstatt.akzentfarbe),
  } as CSSProperties;

  const anschrift = [werkstatt.strasse, [werkstatt.plz, werkstatt.ort].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");

  return (
    <div style={stil} className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Kopfbereich mit dem klaren Einstieg ---------------------------------- */}
        <section className="border-b border-border/70 bg-brand-soft/60">
          <div className="container py-12 sm:py-16">
            <Badge variant="neu" className="mb-4">
              Terminanfrage online
            </Badge>
            <h1 className="text-balance text-3xl font-semibold leading-tight sm:text-4xl">
              {werkstatt.name}
            </h1>
            <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              Wählen Sie unten einen freien Tag und eine Uhrzeit aus — wir melden
              uns mit der Bestätigung. Eine Preisschätzung sehen Sie schon vor der
              Anfrage.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="#kalender">
                  <CalendarCheck className="mr-2 h-4 w-4" />
                  Termin anfragen
                </Link>
              </Button>
              {werkstatt.telefon && (
                <Button asChild size="lg" variant="outline">
                  <a href={`tel:${werkstatt.telefon.replace(/\s+/g, "")}`}>
                    <Phone className="mr-2 h-4 w-4" />
                    {werkstatt.telefon}
                  </a>
                </Button>
              )}
            </div>

            <div className="mt-8 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {anschrift && (
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {anschrift}
                </p>
              )}
              {werkstatt.email && (
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0" />
                  <a className="underline underline-offset-2" href={`mailto:${werkstatt.email}`}>
                    {werkstatt.email}
                  </a>
                </p>
              )}
            </div>

            <div className="mt-8">
              <p className="mb-2 text-sm font-medium">Nächste freie Tage</p>
              <NaechsteFreieTage tage={werkstatt.naechsteFreie} />
            </div>
          </div>
        </section>

        {/* Kalender ------------------------------------------------------------ */}
        <section id="kalender" className="container scroll-mt-20 py-12 sm:py-16">
          <h2 className="text-2xl font-semibold sm:text-3xl">Freie Termine</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Alle Zeiten werden aus den Öffnungszeiten der Werkstatt berechnet —
            belegte und gesperrte Tage sind entsprechend gekennzeichnet.
          </p>

          <div className="mt-8">
            <TerminFlow
              slug={werkstatt.slug}
              zeitzone={werkstatt.zeitzone}
              heute={werkstatt.heute}
              tage={werkstatt.tage}
              werkstattName={werkstatt.name}
              leistungen={LEISTUNGSARTEN}
            />
          </div>
        </section>

        {/* Leistungen ---------------------------------------------------------- */}
        <section className="border-y border-border/70 bg-muted/30 py-12 sm:py-16">
          <div className="container">
            <h2 className="text-2xl font-semibold sm:text-3xl">Leistungen</h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              Die angegebenen Preise sind Einstiegspreise. Die verbindliche
              Einschätzung bekommen Sie mit der Rückmeldung der Werkstatt.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {LEISTUNGSARTEN.map((leistung) => (
                <Card key={leistung.label} className="border-border/70 bg-background">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{leistung.label}</CardTitle>
                    <CardDescription>{leistung.beschreibung}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-brand">
                      {formatierePreisAb(leistung.basis.min)}
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {leistung.dauer}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Öffnungszeiten ------------------------------------------------------ */}
        <section className="container py-12 sm:py-16">
          <h2 className="text-2xl font-semibold sm:text-3xl">Öffnungszeiten</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            In diesen Zeiten sind Termine möglich. Sonderzeiten und Betriebsferien
            sind berücksichtigt.
          </p>

          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Wochentage</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-2 text-sm">
                  {werkstatt.oeffnungszeiten.wochentage.map((zeile) => (
                    <div key={zeile.label} className="flex justify-between gap-4">
                      <dt>{zeile.label}</dt>
                      <dd
                        className={
                          zeile.geschlossen ? "text-muted-foreground" : "font-medium"
                        }
                      >
                        {zeile.zeit}
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            {werkstatt.oeffnungszeiten.ausnahmen.length > 0 && (
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Ausnahmen</CardTitle>
                  <CardDescription>
                    An diesen Tagen nimmt die Werkstatt keine Termine an.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {werkstatt.oeffnungszeiten.ausnahmen.map((zeile) => (
                      <li key={`${zeile.label}-${zeile.hinweis ?? ""}`}>
                        <span className="font-medium">
                          {zeile.label.includes(".")
                            ? zeile.label
                            : formatiereDatum(zeile.label)}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          — {zeile.hinweis ?? "geschlossen"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
