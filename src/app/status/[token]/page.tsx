import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Mail,
  MapPin,
  Phone,
  Info,
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
import { isSupabaseConfigured } from "@/lib/env";
import { ladeOeffentlicheAnfrage } from "@/lib/portal/daten.ts";
import { formatiereDatum, formatiereNaiveZeit, formatiereZeitstempel } from "@/lib/portal/format.ts";
import {
  beschreibeStatus,
  formatierePreisspanne,
  formatiereReferenz,
  statusBadge,
} from "@/lib/portal/status.ts";
import { normalisiereToken, statusLink } from "@/lib/portal/token.ts";

/**
 * Statusseite des Kunden: /status/<token>
 *
 * Der Token ist der einzige Zugang. Er wird streng geprüft (UUID-Format), bevor
 * überhaupt eine Datenbankabfrage läuft; die Datenbankfunktion
 * public.get_public_request liefert höchstens EINE Anfrage zum Token. Ein
 * unbekannter, leerer oder fremder Token endet in einer deutschen 404-Seite —
 * niemals in Daten einer anderen Anfrage.
 *
 * `?neu=1` setzt diesen Aufruf als Erfolg nach dem Absenden: dann erscheinen
 * zusätzlich die Referenznummer und der Hinweis auf die Bestätigungs-E-Mail
 * (der Versand folgt in Baustein 4).
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Stand Ihrer Anfrage",
  robots: { index: false, follow: false },
};

export default async function StatusSeite({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ neu?: string }>;
}) {
  const { token } = await params;
  const { neu } = await searchParams;

  if (!isSupabaseConfigured) {
    return (
      <>
        <SiteHeader />
        <main className="container flex-1 py-16">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold">Stand Ihrer Anfrage</h1>
            <SetupHinweis kontext="Die Statusseite für Kundinnen und Kunden steht bereit." />
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  const saubererToken = normalisiereToken(token);
  if (!saubererToken) notFound();

  const anfrage = await ladeOeffentlicheAnfrage(saubererToken);
  if (!anfrage) notFound();

  const beschreibung = beschreibeStatus(anfrage.status, {
    werkstattName: anfrage.workshopName,
    ablehnungsgrund: anfrage.rejectionReason,
  });
  const preis = formatierePreisspanne(
    anfrage.estimatedPriceMin,
    anfrage.estimatedPriceMax,
  );
  const anschrift = [
    anfrage.workshopStreet,
    [anfrage.workshopPostalCode, anfrage.workshopCity].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const wunschtermin = anfrage.preferredDateFrom
    ? `${formatiereDatum(anfrage.preferredDateFrom)}${
        anfrage.preferredTimeNote ? `, ${anfrage.preferredTimeNote}` : ""
      }`
    : "—";
  const termin =
    anfrage.appointmentStartsAt !== null
      ? `${formatiereNaiveZeit(anfrage.appointmentStartsAt)}${
          anfrage.appointmentEndsAt
            ? ` – ${formatiereNaiveZeit(anfrage.appointmentEndsAt).split(", ").at(-1)}`
            : ""
        }`
      : null;
  const fahrzeug = [anfrage.vehicleMake, anfrage.vehicleModel]
    .filter(Boolean)
    .join(" ");
  const relativLink = statusLink(saubererToken, "");

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="border-b border-border/70 bg-muted/30">
          <div className="container py-10 sm:py-14">
            <p className="text-sm font-medium text-brand">
              {anfrage.workshopName ?? "Ihre Werkstatt"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold sm:text-3xl">{beschreibung.titel}</h1>
              <Badge variant={statusBadge(anfrage.status)}>{beschreibung.kurz}</Badge>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Referenznummer{" "}
              <span className="font-medium text-foreground">
                {formatiereReferenz(anfrage.reference)}
              </span>
              {anfrage.createdAt && (
                <> · angefragt am {formatiereZeitstempel(anfrage.createdAt)}</>
              )}
            </p>
          </div>
        </section>

        <div className="container grid gap-6 py-10 sm:py-14 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {neu === "1" && (
              <div className="rounded-xl border border-status-bestaetigt/30 bg-status-bestaetigt/10 p-4">
                <p className="flex items-center gap-2 font-medium text-status-bestaetigt">
                  <CheckCircle2 className="h-4 w-4" />
                  Anfrage abgeschickt
                </p>
                <p className="mt-2 text-sm text-foreground/80">
                  Ihre Anfrage ist bei{" "}
                  {anfrage.workshopName ?? "der Werkstatt"} eingegangen. Merken Sie
                  sich Ihre Referenznummer{" "}
                  <span className="font-semibold">
                    {formatiereReferenz(anfrage.reference)}
                  </span>
                  . Eine Bestätigung per E-Mail ist vorgesehen, sobald die Werkstatt
                  den Versand freigeschaltet hat — den aktuellen Stand sehen Sie
                  jederzeit auf dieser Seite.
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Direkter Link zu dieser Seite (zum Abspeichern):{" "}
                  <code className="rounded bg-background px-1.5 py-0.5">{relativLink}</code>
                </p>
              </div>
            )}

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Stand Ihrer Anfrage</CardTitle>
                <CardDescription>{beschreibung.kurz}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 text-sm">
                <p className="whitespace-pre-line leading-relaxed text-muted-foreground">
                  {beschreibung.nachricht}
                </p>

                <div>
                  <p className="font-medium">Die nächsten Schritte</p>
                  <ol className="mt-2 space-y-2">
                    {beschreibung.naechsteSchritte.map((schritt, index) => (
                      <li key={schritt} className="flex gap-3">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand">
                          {index + 1}
                        </span>
                        <span className="text-muted-foreground">{schritt}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Ihre Anfrage im Einzelnen</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="divide-y divide-border/70 text-sm">
                  <div className="flex flex-wrap justify-between gap-2 py-2">
                    <dt className="text-muted-foreground">Anliegen</dt>
                    <dd className="max-w-prose text-right font-medium">
                      {anfrage.serviceType ?? "—"}
                    </dd>
                  </div>
                  {anfrage.description && (
                    <div className="flex flex-wrap justify-between gap-2 py-2">
                      <dt className="text-muted-foreground">Beschreibung</dt>
                      <dd className="max-w-prose whitespace-pre-line text-right">
                        {anfrage.description}
                      </dd>
                    </div>
                  )}
                  <div className="flex flex-wrap justify-between gap-2 py-2">
                    <dt className="text-muted-foreground">Gewünschter Termin</dt>
                    <dd className="font-medium">{wunschtermin}</dd>
                  </div>
                  {termin && (
                    <div className="flex flex-wrap justify-between gap-2 py-2">
                      <dt className="text-muted-foreground">Bestätigter Termin</dt>
                      <dd className="font-medium text-status-bestaetigt">{termin}</dd>
                    </div>
                  )}
                  {fahrzeug && (
                    <div className="flex flex-wrap justify-between gap-2 py-2">
                      <dt className="text-muted-foreground">Fahrzeug</dt>
                      <dd className="font-medium">{fahrzeug}</dd>
                    </div>
                  )}
                  {preis && (
                    <div className="flex flex-wrap justify-between gap-2 py-2">
                      <dt className="text-muted-foreground">
                        Preisschätzung (unverbindlich)
                      </dt>
                      <dd className="font-medium">{preis}</dd>
                    </div>
                  )}
                </dl>
                {preis && anfrage.priceEstimateNote && (
                  <p className="mt-3 flex gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {anfrage.priceEstimateNote}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-4 w-4 text-brand" />
                  Ihre Werkstatt
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="font-medium">{anfrage.workshopName ?? "—"}</p>
                {anschrift && (
                  <p className="flex items-start gap-2 text-muted-foreground">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    {anschrift}
                  </p>
                )}
                {anfrage.workshopPhone && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 shrink-0" />
                    <a
                      className="underline underline-offset-2"
                      href={`tel:${anfrage.workshopPhone.replace(/\s+/g, "")}`}
                    >
                      {anfrage.workshopPhone}
                    </a>
                  </p>
                )}
                {anfrage.workshopEmail && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-4 w-4 shrink-0" />
                    <a
                      className="underline underline-offset-2"
                      href={`mailto:${anfrage.workshopEmail}`}
                    >
                      {anfrage.workshopEmail}
                    </a>
                  </p>
                )}
                {anfrage.workshopSlug && (
                  <Button asChild variant="outline" className="w-full">
                    <Link href={`/w/${anfrage.workshopSlug}`}>
                      Zur Werkstattseite
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Clock className="h-4 w-4 text-brand" />
                  Hinweis
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Diese Seite zeigt immer den aktuellen Stand Ihrer Anfrage. Die
                Terminbestätigung Ihrer Werkstatt ist verbindlich; die
                Preisschätzung ist ein unverbindlicher Richtwert.
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
