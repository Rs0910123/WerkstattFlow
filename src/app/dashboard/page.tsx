import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Car,
  ClipboardList,
  Info,
  ThumbsDown,
  ThumbsUp,
  Users,
} from "lucide-react";

import { SetupHinweis } from "@/components/setup-hinweis";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ladeDashboardDaten, type DashboardDaten } from "@/lib/data/dashboard";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import {
  STATUS_BESCHRIFTUNG,
  TERMIN_STATUS_BESCHRIFTUNG,
  WOCHENTAGE,
  type AnfrageStatus,
} from "@/types/database";

// Dieser Bereich hängt an der angemeldeten Sitzung und darf niemals
// vorgerendert werden.
export const dynamic = "force-dynamic";

export const metadata = { title: "Übersicht" };

function StatusBadge({ status }: { status: AnfrageStatus }) {
  return (
    <Badge variant={status}>{STATUS_BESCHRIFTUNG[status]}</Badge>
  );
}

function Kennzahl({
  titel,
  wert,
  icon: Icon,
  hinweis,
}: {
  titel: string;
  wert: number;
  icon: React.ComponentType<{ className?: string }>;
  hinweis?: string;
}) {
  return (
    <Card className="border-border/70">
      <CardContent className="flex items-start gap-4 p-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{titel}</p>
          <p className="mt-1 text-2xl font-semibold leading-none">{wert}</p>
          {hinweis && (
            <p className="mt-1.5 text-xs text-muted-foreground">{hinweis}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Uebersicht({ daten }: { daten: DashboardDaten }) {
  const { firma, benutzer, kennzahlen, anfragen, termine, verfuegbarkeiten } =
    daten;

  const wochenplan = verfuegbarkeiten.filter(
    (zeile) => zeile.weekday !== null,
  );
  const ausnahmen = verfuegbarkeiten.filter(
    (zeile) => zeile.specific_date !== null,
  );

  return (
    <div className="space-y-8">
      {/* Kopf ---------------------------------------------------------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Übersicht</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {firma.name}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Angemeldet als {benutzer.name} (
            {benutzer.rolle === "inhaber" ? "Inhaber" : "Mitarbeiter"})
            {firma.city ? ` · ${firma.city}` : ""}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard">Aktualisieren</Link>
        </Button>
      </div>

      <Alert variant="info">
        <Info className="h-4 w-4" />
        <AlertTitle>Stand: Baustein 1 — Grundgerüst</AlertTitle>
        <AlertDescription>
          Diese Übersicht zeigt bereits echte Daten Ihrer Werkstatt aus der
          Datenbank (Demo-Daten, solange das Kundenportal noch nicht anfragt).
          Bearbeiten — Bestätigen, Ablehnen, Kalender — kommt mit Baustein 3.
        </AlertDescription>
      </Alert>

      {/* Kennzahlen ---------------------------------------------------------- */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Kennzahl
          titel="Offene Anfragen"
          wert={kennzahlen.offeneAnfragen}
          icon={ClipboardList}
          hinweis="Status „neu“ — noch nicht bearbeitet"
        />
        <Kennzahl
          titel="Bestätigte Anfragen"
          wert={kennzahlen.bestaetigteAnfragen}
          icon={ThumbsUp}
        />
        <Kennzahl
          titel="Kommende Termine"
          wert={kennzahlen.kommendeTermine}
          icon={CalendarClock}
          hinweis="ab heute, Status geplant oder bestätigt"
        />
        <Kennzahl
          titel="Kunden"
          wert={kennzahlen.kunden}
          icon={Users}
          hinweis={`${kennzahlen.fahrzeuge} Fahrzeuge im Bestand`}
        />
      </div>

      {/* Anfragen ------------------------------------------------------------ */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Anfragen</CardTitle>
          <CardDescription>
            Die zehn zuletzt eingegangenen Anfragen Ihrer Werkstatt.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          {anfragen.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Noch keine Anfragen vorhanden.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nummer</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead className="hidden md:table-cell">Fahrzeug</TableHead>
                  <TableHead>Leistung</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Preisschätzung
                  </TableHead>
                  <TableHead>Eingang</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anfragen.map((anfrage) => (
                  <TableRow key={anfrage.id}>
                    <TableCell className="font-medium">
                      {anfrage.reference}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={anfrage.status} />
                    </TableCell>
                    <TableCell>
                      <span className="block">{anfrage.kunde?.name ?? "—"}</span>
                      {anfrage.kunde?.telefon && (
                        <span className="block text-xs text-muted-foreground">
                          {anfrage.kunde.telefon}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {anfrage.fahrzeug
                        ? `${anfrage.fahrzeug.bezeichnung}${
                            anfrage.fahrzeug.kennzeichen
                              ? ` (${anfrage.fahrzeug.kennzeichen})`
                              : ""
                          }`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <span className="block">{anfrage.service_type}</span>
                      {anfrage.description && (
                        <span className="block max-w-xs truncate text-xs text-muted-foreground">
                          {anfrage.description}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">
                      {anfrage.estimated_price_min === null &&
                      anfrage.estimated_price_max === null
                        ? "—"
                        : `ab ${formatCurrency(anfrage.estimated_price_min)}${
                            anfrage.estimated_price_max !== null &&
                            anfrage.estimated_price_max !==
                              anfrage.estimated_price_min
                              ? ` bis ${formatCurrency(anfrage.estimated_price_max)}`
                              : ""
                          }`}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(anfrage.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Termine ----------------------------------------------------------- */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Termine im Kalender</CardTitle>
            <CardDescription>
              Geplante und bestätigte Termine Ihrer Werkstatt.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {termine.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Noch keine Termine vorhanden.
              </p>
            ) : (
              termine.map((termin) => (
                <div
                  key={termin.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border/70 p-4"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{termin.titel}</p>
                    <p className="text-sm text-muted-foreground">
                      {termin.kunde}
                      {termin.fahrzeug ? ` · ${termin.fahrzeug}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(termin.starts_at)} –{" "}
                      {formatDateTime(termin.ends_at).split(", ").pop()}
                      {termin.bay ? ` · ${termin.bay}` : ""}
                    </p>
                  </div>
                  <Badge
                    variant={
                      termin.status === "bestaetigt"
                        ? "bestaetigt"
                        : termin.status === "abgeschlossen"
                          ? "abgeschlossen"
                          : "neu"
                    }
                  >
                    {TERMIN_STATUS_BESCHRIFTUNG[termin.status]}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Verfügbarkeiten --------------------------------------------------- */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle>Verfügbarkeiten</CardTitle>
            <CardDescription>
              Grundlage für die freien Tage im Kundenkalender (Baustein 2).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {wochenplan.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Es sind noch keine Öffnungszeiten hinterlegt.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {wochenplan.map((zeile) => (
                  <li
                    key={zeile.id}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm"
                  >
                    <span className="font-medium">
                      {zeile.weekday ? WOCHENTAGE[zeile.weekday] : "—"}
                    </span>
                    <span className="text-muted-foreground">
                      {zeile.is_closed
                        ? "geschlossen"
                        : `${zeile.open_time?.slice(0, 5)} – ${zeile.close_time?.slice(0, 5)} Uhr`}
                      {!zeile.is_closed && zeile.capacity > 1
                        ? ` · ${zeile.capacity} Fahrzeuge`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {ausnahmen.length > 0 && (
              <div className="rounded-md bg-muted/60 p-4">
                <p className="text-sm font-medium">
                  Ausnahmen (z. B. Betriebsferien)
                </p>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {ausnahmen.map((zeile) => (
                    <li key={zeile.id}>
                      {formatDate(zeile.specific_date)}:{" "}
                      {zeile.is_closed ? "geschlossen" : "geöffnet"}
                      {zeile.note ? ` · ${zeile.note}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mandanten-Info ------------------------------------------------------ */}
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Ihr Mandant</CardTitle>
          <CardDescription>
            Jede Werkstatt hat ihren eigenen abgeschlossenen Bereich. Diese
            Angaben bestimmen, welche Daten in dieser Sitzung sichtbar sind.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Werkstatt</p>
            <p className="mt-0.5 font-medium">{firma.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Öffentlicher Kurzname</p>
            <p className="mt-0.5 font-medium">{firma.slug}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Kontakt</p>
            <p className="mt-0.5 font-medium">
              {firma.phone ?? "—"}
              {firma.email ? ` · ${firma.email}` : ""}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Terminraster</p>
            <p className="mt-0.5 flex items-center gap-2 font-medium">
              <span
                aria-hidden
                className="inline-block h-4 w-4 rounded-sm border border-border"
                style={{ backgroundColor: firma.accent_color }}
              />
              {firma.accent_color} · {firma.slot_minutes} Minuten
            </p>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Abgelehnte Anfragen: {kennzahlen.abgelehnteAnfragen} · abgeschlossene
        Anfragen: {kennzahlen.abgeschlosseneAnfragen}
      </p>
    </div>
  );
}

export default async function DashboardSeite() {
  const ladung = await ladeDashboardDaten();

  if (ladung.status === "nicht_konfiguriert") {
    return (
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <SetupHinweis kontext="Das Dashboard ist fertig gebaut." />
      </div>
    );
  }

  if (ladung.status === "nicht_angemeldet") {
    redirect("/login");
  }

  if (ladung.status === "kein_profil") {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Kein Werkstatt-Zugang gefunden</AlertTitle>
        <AlertDescription>
          <p>
            Zu Ihrem Konto gibt es noch keine Werkstatt. Bitte legen Sie eine
            Werkstatt an oder wenden Sie sich an den Betreiber.
          </p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/">Zur Startseite</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (ladung.status === "fehler") {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Die Daten konnten nicht geladen werden</AlertTitle>
        <AlertDescription>
          <p>
            Bitte prüfen Sie die Verbindung zu Supabase (Werte in{" "}
            <code className="rounded bg-muted px-1">.env.local</code>) und laden
            Sie die Seite neu.
          </p>
          <p className="mt-2 text-xs">Meldung: {ladung.meldung}</p>
        </AlertDescription>
      </Alert>
    );
  }

  return <Uebersicht daten={ladung.daten} />;
}
