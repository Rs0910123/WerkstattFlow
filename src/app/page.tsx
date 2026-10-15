import Link from "next/link";
import {
  BellRing,
  CalendarCheck,
  CheckCircle2,
  LayoutDashboard,
  Lock,
  ShieldCheck,
  Wrench,
} from "lucide-react";

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
import { appName, isSupabaseConfigured } from "@/lib/env";

const bausteine = [
  {
    icon: ShieldCheck,
    titel: "Grundgerüst",
    text: "Datenbank, Mandanten-Trennung, Anmeldung für Werkstätten und Demo-Daten.",
    stand: "fertig",
  },
  {
    icon: CalendarCheck,
    titel: "Kundenportal",
    text: "Öffentliche Seite mit freien Tagen, Mehrschritt-Anfrage und Preisschätzung.",
    stand: "in Arbeit",
  },
  {
    icon: LayoutDashboard,
    titel: "Werkstatt-Dashboard",
    text: "Kalender, Anfragen-Inbox, Bestätigen und Ablehnen, QR-Code für den Kunden-Link.",
    stand: "in Arbeit",
  },
  {
    icon: BellRing,
    titel: "Benachrichtigungen",
    text: "Bestätigung per E-Mail, SMS-Link für Anrufe.",
    stand: "geplant",
  },
];

export default function Startseite() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* Hero ------------------------------------------------------------------ */}
        <section className="container pb-16 pt-14 sm:pb-24 sm:pt-20">
          {!isSupabaseConfigured && (
            <SetupHinweis kontext="Die Anmeldung und das Dashboard sind vorbereitet." />
          )}

          <div className="max-w-3xl">
            <Badge variant="neu" className="mb-5">
              Für Kfz-Werkstätten
            </Badge>

            <h1 className="text-balance text-4xl font-semibold leading-tight sm:text-5xl">
              Terminanfragen kommen an —{" "}
              <span className="text-brand">geordnet statt am Telefon</span>.
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              {appName} ist die Plattform für Termin- und Auftragsanfragen Ihrer
              Werkstatt. Ihre Kundinnen und Kunden fragen online an, Sie sehen
              alles an einer Stelle und bestätigen oder lehnen mit einem Klick
              ab. Jede Werkstatt arbeitet dabei in ihrem eigenen, abgeschlossenen
              Bereich.
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/registrieren">Werkstatt registrieren</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Anmelden</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Drei Versprechen ------------------------------------------------------ */}
        <section className="border-y border-border/70 bg-muted/30 py-16 sm:py-20">
          <div className="container grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Card className="border-border/70 bg-background">
              <CardHeader>
                <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <Wrench className="h-5 w-5" />
                </span>
                <CardTitle>Anfragen statt Rückrufe</CardTitle>
                <CardDescription>
                  Fahrzeug, Wunschtermin und Anliegen kommen vollständig an — mit
                  einer Preisschätzung, die der Kunde vorher sieht.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border/70 bg-background">
              <CardHeader>
                <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <Lock className="h-5 w-5" />
                </span>
                <CardTitle>Jede Werkstatt für sich</CardTitle>
                <CardDescription>
                  Alle Daten hängen an genau einer Werkstatt. Die Trennung ist
                  direkt in der Datenbank verankert, nicht nur in der Oberfläche.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-border/70 bg-background sm:col-span-2 lg:col-span-1">
              <CardHeader>
                <span className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <CardTitle>Deutsch und aufgeräumt</CardTitle>
                <CardDescription>
                  Klare deutsche Beschriftungen, mobile Ansicht, viel Ruhe im
                  Layout — auch am Tablet in der Annahme.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </section>

        {/* Stand der Bausteine --------------------------------------------------- */}
        <section className="container py-16 sm:py-20">
          <h2 className="text-2xl font-semibold sm:text-3xl">
            Wo wir gerade stehen
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Die Plattform entsteht in vier Bausteinen. Das Grundgerüst —
            Datenbank, Anmeldung und Mandanten-Trennung — steht.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {bausteine.map((baustein) => {
              const Icon = baustein.icon;
              return (
                <Card key={baustein.titel} className="border-border/70">
                  <CardHeader className="flex-row items-start gap-4 space-y-0">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div className="space-y-1.5">
                      <CardTitle className="flex flex-wrap items-center gap-2">
                        {baustein.titel}
                        <Badge
                          variant={
                            baustein.stand === "fertig" ? "bestaetigt" : "abgeschlossen"
                          }
                        >
                          {baustein.stand}
                        </Badge>
                      </CardTitle>
                      <CardDescription>{baustein.text}</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {baustein.stand === "fertig"
                      ? "Kann getestet werden: registrieren, anmelden, Demo-Daten ansehen."
                      : "Wird im nächsten Schritt gebaut."}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Demo-Hinweis ---------------------------------------------------------- */}
        <section className="container pb-20">
          <Card className="border-brand/20 bg-brand-soft">
            <CardHeader>
              <CardTitle>Schon ausprobierbar</CardTitle>
              <CardDescription className="text-foreground/70">
                Nach dem Einspielen der Demo-Daten (siehe README) gibt es eine
                Beispiel-Werkstatt mit Login, Kunden, Fahrzeugen und Anfragen in
                allen Status — und eine zweite Werkstatt, an der sich die
                saubere Datentrennung nachvollziehen lässt.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/login">Zur Anmeldung</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/registrieren">Neue Werkstatt anlegen</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
