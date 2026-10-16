import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Car, CheckCircle2, Info, Mail, MapPin, Phone } from "lucide-react";

import { AnfrageAktionen } from "./aktionen";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { ladeAnfrage, ladeDashboardKontext } from "@/lib/dashboard/daten";
import {
  beschreibeEingang,
  beschreibeKontaktart,
  beschreibeQuelle,
  formatierePreisspanne,
  formatiereWunschtermin,
  STATUS_HINWEIS,
  normalisiereAnfrageStatus,
} from "@/lib/dashboard/anfragen";

export const dynamic = "force-dynamic";

const ERFOLGSMELDUNGEN: Record<string, string> = {
  bestaetigen: "Der Termin ist bestätigt und steht im Kalender der Werkstatt.",
  ablehnen: "Die Anfrage wurde abgelehnt. Die Begründung ist gespeichert.",
  abgeschlossen: "Der Auftrag ist als abgeschlossen markiert.",
  storniert: "Der Auftrag wurde storniert; der Termin ist wieder frei.",
};

function Feld({ titel, wert }: { titel: string; wert: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {titel}
      </p>
      <p className="mt-1 text-sm">{wert}</p>
    </div>
  );
}

export default async function AnfrageDetailSeite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erfolg?: string }>;
}) {
  const { id } = await params;
  const { erfolg } = await searchParams;

  const kontext = await ladeDashboardKontext();
  if (kontext.status !== "ok") {
    // Ohne Werkstatt-Zugang gibt es hier nichts zu sehen (deutsche 404-Seite).
    notFound();
  }

  const ladung = await ladeAnfrage(id);
  if (ladung.status === "nicht_gefunden" || ladung.status === "kein_profil") {
    // Auch eine Anfrage einer FREMDEN Werkstatt endet hier: die RLS liefert sie
    // nicht, sie existiert für diese Sitzung also nicht (deutsche 404-Seite).
    notFound();
  }
  if (ladung.status === "fehler") {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Die Anfrage konnte nicht geladen werden</AlertTitle>
        <AlertDescription>
          <p>Bitte laden Sie die Seite neu.</p>
          <p className="mt-2 text-xs">Meldung: {ladung.meldung}</p>
        </AlertDescription>
      </Alert>
    );
  }
  if (ladung.status !== "ok") {
    notFound();
  }

  const anfrage = ladung.anfrage;
  const status = normalisiereAnfrageStatus(anfrage.status);
  const slotMinuten = kontext.status === "ok" ? kontext.firma.slot_minutes : 60;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/anfragen"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück zur Anfragenliste
        </Link>
      </div>

      {erfolg && ERFOLGSMELDUNGEN[erfolg] && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Erledigt</AlertTitle>
          <AlertDescription>{ERFOLGSMELDUNGEN[erfolg]}</AlertDescription>
        </Alert>
      )}

      {/* Kopf -------------------------------------------------------------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {anfrage.reference}
            </h1>
            <Badge variant={status}>{anfrage.service_type}</Badge>
            <Badge variant={status === "neu" ? "neu" : status}>
              {status === "neu"
                ? "Neu"
                : status === "bestaetigt"
                  ? "Bestätigt"
                  : status === "abgelehnt"
                    ? "Abgelehnt"
                    : status === "abgeschlossen"
                      ? "Abgeschlossen"
                      : "Storniert"}
            </Badge>
          </div>
          <p className="mt-2 text-muted-foreground">
            Eingang {formatDateTime(anfrage.created_at)} (
            {beschreibeEingang(anfrage.created_at)}) ·{" "}
            {beschreibeQuelle(anfrage.source)}
          </p>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {STATUS_HINWEIS[status]}
          </p>
        </div>
      </div>

      {/* Aktionen ---------------------------------------------------------- */}
      <Card className="border-border/70">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Bearbeiten</CardTitle>
          <CardDescription>
            Bestätigen und Ablehnen sind nur bei einer neuen Anfrage möglich.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnfrageAktionen
            anfrageId={anfrage.id}
            status={status}
            slotMinuten={slotMinuten}
            wunschVon={anfrage.preferred_date_from}
            wunschBis={anfrage.preferred_date_to}
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Anliegen -------------------------------------------------------- */}
        <Card className="border-border/70 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Anliegen</CardTitle>
            <CardDescription>{anfrage.service_type}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Feld
              titel="Beschreibung des Kunden"
              wert={anfrage.description ?? "Keine Beschreibung angegeben."}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <Feld
                titel="Wunschtermin"
                wert={formatiereWunschtermin(
                  anfrage.preferred_date_from,
                  anfrage.preferred_date_to,
                  anfrage.preferred_time_note,
                )}
              />
              <Feld
                titel="Geschätzte Preisspanne"
                wert={formatierePreisspanne(
                  anfrage.estimated_price_min,
                  anfrage.estimated_price_max,
                )}
              />
            </div>
            {anfrage.price_estimate_note && (
              <Feld titel="Hinweis zur Schätzung" wert={anfrage.price_estimate_note} />
            )}
            {anfrage.termin && (
              <div className="rounded-md bg-brand-soft/70 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CalendarClock className="h-4 w-4" />
                  Termin in der Werkstatt
                </p>
                <p className="mt-1 text-sm">
                  {formatDateTime(anfrage.termin.starts_at)} –{" "}
                  {formatDateTime(anfrage.termin.ends_at).split(", ").pop()}
                  {anfrage.termin.bay ? ` · ${anfrage.termin.bay}` : ""}
                </p>
              </div>
            )}
            {anfrage.rejection_reason && (
              <Alert variant="destructive">
                <AlertTitle>Begründung der Ablehnung</AlertTitle>
                <AlertDescription>{anfrage.rejection_reason}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Kontakt --------------------------------------------------------- */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-lg">Kontakt</CardTitle>
            <CardDescription>
              Gewünschte Kontaktart:{" "}
              <strong>{beschreibeKontaktart(anfrage.contact_preference)}</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="font-medium">{anfrage.kunde?.name ?? "Unbekannt"}</p>
            {anfrage.kunde?.email && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" />
                <a className="hover:underline" href={`mailto:${anfrage.kunde.email}`}>
                  {anfrage.kunde.email}
                </a>
              </p>
            )}
            {anfrage.kunde?.telefon && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                <a className="hover:underline" href={`tel:${anfrage.kunde.telefon}`}>
                  {anfrage.kunde.telefon}
                </a>
              </p>
            )}
            {(anfrage.kunde?.strasse || anfrage.kunde?.ort) && (
              <p className="flex items-start gap-2 text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  {anfrage.kunde?.strasse}
                  {anfrage.kunde?.strasse && <br />}
                  {anfrage.kunde?.plz} {anfrage.kunde?.ort}
                </span>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Der Kunde hat mit dem Absenden der Anfrage der Kontaktaufnahme
              durch die Werkstatt zugestimmt ({beschreibeKontaktart(
                anfrage.contact_preference,
              )}
              ).
            </p>
          </CardContent>
        </Card>

        {/* Fahrzeug -------------------------------------------------------- */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Car className="h-4 w-4" />
              Fahrzeug
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
            {anfrage.fahrzeug ? (
              <>
                <Feld titel="Fahrzeug" wert={anfrage.fahrzeug.bezeichnung} />
                <Feld titel="Kennzeichen" wert={anfrage.fahrzeug.kennzeichen ?? "—"} />
                <Feld
                  titel="Baujahr"
                  wert={anfrage.fahrzeug.baujahr?.toString() ?? "—"}
                />
                <Feld
                  titel="Kilometerstand"
                  wert={
                    anfrage.fahrzeug.kilometerstand !== null
                      ? `${new Intl.NumberFormat("de-DE").format(
                          anfrage.fahrzeug.kilometerstand,
                        )} km`
                      : "—"
                  }
                />
              </>
            ) : (
              <p className="text-muted-foreground">
                Zu dieser Anfrage ist kein Fahrzeug hinterlegt.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Verlauf --------------------------------------------------------- */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-lg">Verlauf</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Feld titel="Eingang" wert={formatDateTime(anfrage.created_at)} />
            <Feld
              titel="Entschieden am"
              wert={anfrage.decided_at ? formatDateTime(anfrage.decided_at) : "—"}
            />
            <Feld
              titel="Interne Notiz"
              wert={anfrage.staff_note ?? "Keine Notiz hinterlegt."}
            />
          </CardContent>
        </Card>

        {/* Mandanten-Hinweis ---------------------------------------------- */}
        <Card className="border-border/70 bg-muted/40">
          <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Diese Anfrage gehört zu Ihrer Werkstatt — der Zugriff wird in der
              Datenbank über Row Level Security geprüft, nicht in der Oberfläche.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="outline">
          <Link href="/dashboard/anfragen">Zur Anfragenliste</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/dashboard">Zur Übersicht</Link>
        </Button>
      </div>
    </div>
  );
}
