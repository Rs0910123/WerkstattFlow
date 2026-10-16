import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Info } from "lucide-react";

import { SetupHinweis } from "@/components/setup-hinweis";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ladeAnfragen, type AnfrageZeile } from "@/lib/dashboard/daten";
import {
  beschreibeEingang,
  berechneKennzahlen,
  filtereAnfragen,
  formatierePreisspanne,
  formatiereTag,
  formatiereWunschtermin,
  normalisiereSortierung,
  normalisiereStatusFilter,
  sortiereAnfragen,
  STATUS_FILTER,
  SORTIER_RICHTUNGEN,
} from "@/lib/dashboard/anfragen";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anfragen" };

type SuchParameter = { status?: string; sortierung?: string };

/** Kennzahlenzeile über der Liste ("2 neu · 1 bestätigt ..."). */
function KennzahlenZeile({ anfragen }: { anfragen: readonly AnfrageZeile[] }) {
  const k = berechneKennzahlen(anfragen);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span>
        <strong className="font-semibold text-foreground">{k.gesamt}</strong>{" "}
        Anfragen insgesamt
      </span>
      <span aria-hidden>·</span>
      <span>
        <strong className="font-semibold text-foreground">{k.offen}</strong> neu
      </span>
      <span aria-hidden>·</span>
      <span>
        <strong className="font-semibold text-foreground">{k.bestaetigt}</strong>{" "}
        bestätigt
      </span>
      <span aria-hidden>·</span>
      <span>
        <strong className="font-semibold text-foreground">{k.abgelehnt}</strong>{" "}
        abgelehnt
      </span>
    </div>
  );
}

/** Ein Filterknopf; hält die gewählte Sortierung in der Adresse. */
function FilterKnopf({
  label,
  anzahl,
  aktiv,
  href,
}: {
  label: string;
  anzahl: number;
  aktiv: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors " +
        (aktiv
          ? "border-brand bg-brand-soft text-brand"
          : "border-border bg-background text-muted-foreground hover:text-foreground")
      }
      aria-current={aktiv ? "true" : undefined}
    >
      {label}
      <span className={aktiv ? "text-brand/70" : "text-muted-foreground/70"}>
        {anzahl}
      </span>
    </Link>
  );
}

function AnfrageKarte({ anfrage }: { anfrage: AnfrageZeile }) {
  return (
    <Link
      href={`/dashboard/anfragen/${anfrage.id}`}
      className="flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-background p-4 transition-colors hover:border-brand/40"
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{anfrage.reference}</span>
          <Badge variant={anfrage.status}>{anfrage.status}</Badge>
        </div>
        <p className="truncate text-sm font-medium">{anfrage.service_type}</p>
        <p className="truncate text-sm text-muted-foreground">
          {anfrage.kunde?.name ?? "Ohne Kundenzuordnung"}
          {anfrage.fahrzeug
            ? ` · ${anfrage.fahrzeug.bezeichnung}${
                anfrage.fahrzeug.kennzeichen
                  ? ` (${anfrage.fahrzeug.kennzeichen})`
                  : ""
              }`
            : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          Wunsch:{" "}
          {formatiereWunschtermin(
            anfrage.preferred_date_from,
            anfrage.preferred_date_to,
            anfrage.preferred_time_note,
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Eingang {formatDateTime(anfrage.created_at)} (
          {beschreibeEingang(anfrage.created_at)}) ·{" "}
          {formatierePreisspanne(
            anfrage.estimated_price_min,
            anfrage.estimated_price_max,
          )}
        </p>
      </div>
      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default async function AnfragenSeite({
  searchParams,
}: {
  searchParams: Promise<SuchParameter>;
}) {
  const parameter = await searchParams;
  const filter = normalisiereStatusFilter(parameter?.status);
  const sortierung = normalisiereSortierung(parameter?.sortierung);

  const ladung = await ladeAnfragen();

  if (ladung.status === "nicht_konfiguriert") {
    return (
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Anfragen</h1>
        <SetupHinweis kontext="Die Anfragen-Inbox ist fertig gebaut." />
      </div>
    );
  }

  if (ladung.status === "nicht_angemeldet" || ladung.status === "kein_profil") {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Kein Werkstatt-Zugang gefunden</AlertTitle>
        <AlertDescription>
          Bitte melden Sie sich an. Ohne Werkstatt-Zuordnung lässt sich keine
          Anfrage anzeigen.
        </AlertDescription>
      </Alert>
    );
  }

  if (ladung.status === "fehler") {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Die Anfragen konnten nicht geladen werden</AlertTitle>
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

  const alle = ladung.anfragen;
  const gefiltert = sortiereAnfragen(filtereAnfragen(alle, filter), sortierung);

  if (alle.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Anfragen</h1>
        <Card className="border-border/70">
          <CardContent className="flex flex-col items-start gap-3 p-8">
            <Info className="h-5 w-5 text-muted-foreground" />
            <p className="font-medium">Noch keine Anfragen vorhanden</p>
            <p className="max-w-prose text-sm text-muted-foreground">
              Sobald ein Kunde über Ihr Kundenportal einen Termin anfragt,
              erscheint die Anfrage hier. Den Link zu Ihrem Kundenportal finden
              Sie auf der Übersicht.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">Zur Übersicht</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const zaehle = (status: string) =>
    status === "alle"
      ? alle.length
      : alle.filter((anfrage) => anfrage.status === status).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Anfragen</h1>
        <p className="text-muted-foreground">
          Alle Termin- und Auftragsanfragen Ihrer Werkstatt — neueste zuerst.
        </p>
        <KennzahlenZeile anfragen={alle} />
      </div>

      {/* Filter und Sortierung ------------------------------------------------ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Nach Status filtern">
          {STATUS_FILTER.map((eintrag) => (
            <FilterKnopf
              key={eintrag.wert}
              label={eintrag.label}
              anzahl={zaehle(eintrag.wert)}
              aktiv={filter === eintrag.wert}
              href={`/dashboard/anfragen?status=${eintrag.wert}&sortierung=${sortierung}`}
            />
          ))}
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          <span className="self-center text-muted-foreground">Sortierung:</span>
          {SORTIER_RICHTUNGEN.map((eintrag) => (
            <Link
              key={eintrag.wert}
              href={`/dashboard/anfragen?status=${filter}&sortierung=${eintrag.wert}`}
              className={
                "rounded-md px-2.5 py-1 " +
                (sortierung === eintrag.wert
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {eintrag.label}
            </Link>
          ))}
        </div>
      </div>

      {gefiltert.length === 0 ? (
        <Card className="border-border/70">
          <CardContent className="p-8 text-sm text-muted-foreground">
            Keine Anfrage mit diesem Status.{" "}
            <Link
              href={`/dashboard/anfragen?sortierung=${sortierung}`}
              className="font-medium text-brand underline"
            >
              Alle Anfragen anzeigen
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Schmale Bildschirme: Kartenliste (mobil-first) ------------------- */}
          <div className="space-y-3 lg:hidden">
            {gefiltert.map((anfrage) => (
              <AnfrageKarte key={anfrage.id} anfrage={anfrage} />
            ))}
          </div>

          {/* Breite Bildschirme: Tabelle -------------------------------------- */}
          <div className="hidden overflow-hidden rounded-lg border border-border/70 bg-background lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Referenz</th>
                  <th className="px-4 py-3 font-medium">Eingang</th>
                  <th className="px-4 py-3 font-medium">Kunde</th>
                  <th className="px-4 py-3 font-medium">Fahrzeug</th>
                  <th className="px-4 py-3 font-medium">Anliegen</th>
                  <th className="px-4 py-3 font-medium">Wunschtermin</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Schätzung</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {gefiltert.map((anfrage) => (
                  <tr key={anfrage.id} className="align-top hover:bg-muted/40">
                    <td className="whitespace-nowrap px-4 py-3 font-medium">
                      {anfrage.reference}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatiereTag(anfrage.created_at.slice(0, 10))}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block">{anfrage.kunde?.name ?? "—"}</span>
                      {anfrage.kunde?.telefon && (
                        <span className="block text-xs text-muted-foreground">
                          {anfrage.kunde.telefon}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {anfrage.fahrzeug ? (
                        <>
                          <span className="block">
                            {anfrage.fahrzeug.bezeichnung}
                          </span>
                          {anfrage.fahrzeug.kennzeichen && (
                            <span className="block text-xs text-muted-foreground">
                              {anfrage.fahrzeug.kennzeichen}
                            </span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <span className="block">{anfrage.service_type}</span>
                      {anfrage.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {anfrage.description}
                        </span>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3 text-muted-foreground">
                      {formatiereWunschtermin(
                        anfrage.preferred_date_from,
                        anfrage.preferred_date_to,
                        anfrage.preferred_time_note,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={anfrage.status}>
                        {anfrage.status === "neu"
                          ? "Neu"
                          : anfrage.status === "bestaetigt"
                            ? "Bestätigt"
                            : anfrage.status === "abgelehnt"
                              ? "Abgelehnt"
                              : anfrage.status === "abgeschlossen"
                                ? "Abgeschlossen"
                                : "Storniert"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatierePreisspanne(
                        anfrage.estimated_price_min,
                        anfrage.estimated_price_max,
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/anfragen/${anfrage.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        Öffnen
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Alert variant="info">
        <AlertTitle>Mandanten-Trennung</AlertTitle>
        <AlertDescription>
          Diese Liste enthält ausschließlich Anfragen Ihrer eigenen Werkstatt —
          durchgesetzt in der Datenbank (Row Level Security), nicht nur in der
          Oberfläche.
        </AlertDescription>
      </Alert>
    </div>
  );
}
