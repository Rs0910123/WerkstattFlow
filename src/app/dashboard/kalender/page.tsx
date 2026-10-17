import Link from "next/link";

import { SetupHinweis } from "@/components/setup-hinweis";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { findeRegel } from "@/lib/portal/kalender.ts";
import {
  formatiereDatum,
  formatiereDatumKurz,
  formatiereDatumLang,
  formatiereMonat,
} from "@/lib/portal/format.ts";
import { ladeKalenderdaten } from "@/lib/dashboard/kalender-daten.ts";
import {
  anfragenAmTag,
  anfragenOhneZeitraum,
  berechneKalenderKennzahlen,
  heuteInZeitzone,
  monatAusTag,
  monatPlus,
  monatsGrenzen,
  monatsTage,
  monatsZellen,
  normalisiereMonat,
  normalisiereTag,
  ordneTermineTagen,
  wochenTage,
  wochenVersatz,
  type KalenderAnfrage,
  type TerminImTag,
} from "@/lib/dashboard/kalender.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Termine" };

/** Zeitzone, mit der die Suchparameter ausgewertet werden, bevor der Mandant geladen ist. */
const ANNAHME_ZEITZONE = "Europe/Berlin";

const WOCHENTAG_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const TERMIN_STATUS_LABEL: Record<string, string> = {
  geplant: "geplant",
  bestaetigt: "bestätigt",
  abgeschlossen: "abgeschlossen",
  abgesagt: "abgesagt",
  nicht_erschienen: "nicht erschienen",
};

type SuchParameter = { monat?: string; tag?: string; ansicht?: string };

type Ansicht = "monat" | "woche";

/** Ein Link auf dieselbe Seite mit geänderten Parametern. */
function link(
  ansicht: Ansicht,
  monat: string,
  tag: string | null,
  zusatz: { tagSetzen?: string } = {},
): string {
  const teile = new URLSearchParams();
  teile.set("ansicht", ansicht);
  teile.set("monat", monat);
  if (zusatz.tagSetzen !== undefined) teile.set("tag", zusatz.tagSetzen);
  else if (tag) teile.set("tag", tag);
  return `/dashboard/kalender?${teile.toString()}`;
}

/** Zeitraum, den die Ansicht abdeckt. */
function zeitraumFuer(
  ansicht: Ansicht,
  monat: string,
  tag: string | null,
  heute: string,
): { von: string; bis: string; tage: string[] } {
  if (ansicht === "woche") {
    const tage = wochenTage(tag ?? heute);
    return { von: tage[0], bis: tage[6], tage };
  }
  const grenzen = monatsGrenzen(monat);
  // Für die Monatsansicht laden wir das ganze Raster (auch die Randtage der
  // Nachbarmonate), damit die Rasterzellen vollständig gefüllt sind.
  return { von: grenzen.von, bis: grenzen.bis, tage: monatsTage(monat) };
}

/** Ein Termin in der Tagesliste. */
function TerminZeile({ termin }: { termin: TerminImTag }) {
  return (
    <li className="flex flex-col gap-1 border-b border-border/60 py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-32 shrink-0 text-sm font-semibold tabular-nums">
        {termin.uhrzeit}
        {termin.laeuftUeberMitternacht && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            (bis Folgetag)
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{termin.titel}</p>
        <p className="text-sm text-muted-foreground">
          {termin.kunde ?? "Ohne Kundenzuordnung"}
          {termin.fahrzeug ? ` · ${termin.fahrzeug}` : ""}
        </p>
        <p className="text-sm text-muted-foreground">
          {termin.leistung ? `Leistung: ${termin.leistung}` : "Keine Leistung hinterlegt"}
          {termin.bay ? ` · ${termin.bay}` : ""}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {TERMIN_STATUS_LABEL[termin.status] ?? termin.status}
          {termin.referenz ? ` · Anfrage ${termin.referenz}` : ""}
        </p>
      </div>
      {termin.anfrageId && (
        <Link
          href={`/dashboard/anfragen/${termin.anfrageId}`}
          className="text-sm font-medium text-brand hover:underline"
        >
          Anfrage öffnen
        </Link>
      )}
    </li>
  );
}

/** Eine offene Anfrage, die für den gewählten Tag relevant ist. */
function AnfrageZeile({ anfrage }: { anfrage: KalenderAnfrage }) {
  const zeitraum =
    anfrage.wunschVon && anfrage.wunschBis
      ? `${formatiereDatum(anfrage.wunschVon)} – ${formatiereDatum(anfrage.wunschBis)}`
      : anfrage.wunschVon
        ? `ab ${formatiereDatum(anfrage.wunschVon)}`
        : anfrage.wunschBis
          ? `bis ${formatiereDatum(anfrage.wunschBis)}`
          : "kein Wunschzeitraum";

  return (
    <li className="flex flex-col gap-1 border-b border-border/60 py-3 last:border-b-0 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-32 shrink-0 text-xs text-muted-foreground">
        <Badge variant="neu">Neu</Badge>
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {anfrage.serviceType || "Anfrage"}{" "}
          <span className="text-sm font-normal text-muted-foreground">
            ({anfrage.reference})
          </span>
        </p>
        <p className="text-sm text-muted-foreground">
          {anfrage.kunde ?? "Ohne Kundenzuordnung"}
          {anfrage.fahrzeug ? ` · ${anfrage.fahrzeug}` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          Wunsch: {zeitraum}
          {anfrage.zeitHinweis ? ` · ${anfrage.zeitHinweis}` : ""}
          {anfrage.preisHinweis ? ` · Schätzung ${anfrage.preisHinweis}` : ""}
        </p>
      </div>
      <Link
        href={`/dashboard/anfragen/${anfrage.id}`}
        className="text-sm font-medium text-brand hover:underline"
      >
        Anfrage öffnen
      </Link>
    </li>
  );
}

export default async function KalenderSeite({
  searchParams,
}: {
  searchParams: Promise<SuchParameter>;
}) {
  const parameter = (await searchParams) ?? {};
  const ansicht: Ansicht = parameter.ansicht === "woche" ? "woche" : "monat";

  let zeitzone = ANNAHME_ZEITZONE;
  let heute = heuteInZeitzone(zeitzone);
  let monat = normalisiereMonat(parameter.monat, heute);
  let tag = normalisiereTag(parameter.tag);
  let zeitraum = zeitraumFuer(ansicht, monat, tag, heute);
  let ladung = await ladeKalenderdaten(zeitraum.von, zeitraum.bis);

  // Zweiter Durchgang nur, wenn die Werkstatt in einer anderen Zeitzone liegt
  // als angenommen: dann können Monat und Tag an der Tagesgrenze anders liegen.
  if (ladung.status === "ok" && ladung.zeitzone !== zeitzone) {
    zeitzone = ladung.zeitzone;
    heute = heuteInZeitzone(zeitzone);
    monat = normalisiereMonat(parameter.monat, heute);
    tag = normalisiereTag(parameter.tag);
    zeitraum = zeitraumFuer(ansicht, monat, tag, heute);
    ladung = await ladeKalenderdaten(zeitraum.von, zeitraum.bis);
  }

  if (ladung.status === "nicht_konfiguriert") {
    return (
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Termine</h1>
        <SetupHinweis kontext="Die Terminübersicht ist fertig gebaut." />
      </div>
    );
  }

  if (ladung.status === "nicht_angemeldet" || ladung.status === "kein_profil") {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Kein Werkstatt-Zugang gefunden</AlertTitle>
        <AlertDescription>
          Bitte melden Sie sich an. Ohne Werkstatt-Zuordnung lässt sich kein
          Kalender anzeigen.
        </AlertDescription>
      </Alert>
    );
  }

  if (ladung.status === "fehler") {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Die Termine konnten nicht geladen werden</AlertTitle>
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

  const { termine, offeneAnfragen, verfuegbarkeiten, firma } = ladung;
  const termineJeTag = ordneTermineTagen(termine, zeitzone);
  const monatTage = monatsTage(monat);
  const geoeffneteTage = monatTage.filter((eintrag) => {
    const regel = findeRegel(verfuegbarkeiten, eintrag);
    return regel !== null && !regel.is_closed;
  });
  const kennzahlen = berechneKalenderKennzahlen(
    monat,
    termine,
    offeneAnfragen,
    zeitzone,
    heute,
    geoeffneteTage,
  );

  // Gewählter Tag: der aufgerufene, sonst heute (falls im Zeitraum), sonst der
  // nächste Tag mit Terminen — so ist die Seite beim Öffnen nie leer.
  const gewaehlterTag =
    tag ??
    (zeitraum.tage.includes(heute)
      ? heute
      : (zeitraum.tage.find((eintrag) => (termineJeTag.get(eintrag)?.length ?? 0) > 0) ?? null));

  const termineDesTages = gewaehlterTag ? (termineJeTag.get(gewaehlterTag) ?? []) : [];
  const anfragenDesTages = gewaehlterTag ? anfragenAmTag(offeneAnfragen, gewaehlterTag) : [];
  const ohneZeitraum = anfragenOhneZeitraum(offeneAnfragen);
  const zellen = monatsZellen(monat, termineJeTag, offeneAnfragen);
  const [monatJahr, monatNummer] = monat.split("-");

  const zurueck =
    ansicht === "woche"
      ? { monat: monatAusTag(wochenVersatz(gewaehlterTag ?? heute, -1)), tag: wochenVersatz(gewaehlterTag ?? heute, -1) }
      : { monat: monatPlus(monat, -1), tag: null };
  const vor =
    ansicht === "woche"
      ? { monat: monatAusTag(wochenVersatz(gewaehlterTag ?? heute, 1)), tag: wochenVersatz(gewaehlterTag ?? heute, 1) }
      : { monat: monatPlus(monat, 1), tag: null };

  const ueberschrift =
    ansicht === "woche" && zeitraum.tage.length === 7
      ? `Woche ${formatiereDatumKurz(zeitraum.tage[0])} – ${formatiereDatumKurz(zeitraum.tage[6])}`
      : formatiereMonat(Number(monatJahr), Number(monatNummer));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Termine</h1>
        <p className="text-muted-foreground">
          Alle vergebenen Termine Ihrer Werkstatt im Kalender — dazu die offenen
          Anfragen, die zu einem Tag passen. Zeiten in der Zeitzone Ihrer
          Werkstatt ({firma.timezone || "Europe/Berlin"}).
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            <strong className="font-semibold text-foreground">
              {kennzahlen.termineImMonat}
            </strong>{" "}
            Termine im Monat
          </span>
          <span aria-hidden>·</span>
          <span>
            <strong className="font-semibold text-foreground">
              {kennzahlen.belegteTage}
            </strong>{" "}
            belegte Tage ({kennzahlen.auslastungProzent} % der geöffneten Tage)
          </span>
          <span aria-hidden>·</span>
          <span>
            <strong className="font-semibold text-foreground">
              {kennzahlen.offeneAnfragenImMonat}
            </strong>{" "}
            offene Anfragen mit Wunschzeitraum
          </span>
          {kennzahlen.offeneAnfragenOhneZeitraum > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{kennzahlen.offeneAnfragenOhneZeitraum} ohne Wunschzeitraum</span>
            </>
          )}
        </div>
      </div>

      {/* Steuerleiste ------------------------------------------------------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="flex items-center gap-2"
          role="group"
          aria-label="Zeitraum wechseln"
        >
          <Link
            href={link(ansicht, zurueck.monat, zurueck.tag)}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            ← {ansicht === "woche" ? "Vorherige Woche" : "Vorheriger Monat"}
          </Link>
          <Link
            href={`/dashboard/kalender?ansicht=${ansicht}`}
            className="rounded-md bg-brand-soft px-3 py-1.5 text-sm font-medium text-brand"
          >
            Heute
          </Link>
          <Link
            href={link(ansicht, vor.monat, vor.tag)}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            {ansicht === "woche" ? "Nächste Woche" : "Nächster Monat"} →
          </Link>
          <span className="ml-1 font-medium">{ueberschrift}</span>
        </div>

        <div className="flex gap-1 text-sm" role="group" aria-label="Ansicht">
          {(
            [
              { wert: "monat", label: "Monat" },
              { wert: "woche", label: "Woche" },
            ] as const
          ).map((eintrag) => (
            <Link
              key={eintrag.wert}
              href={link(eintrag.wert, monat, gewaehlterTag)}
              aria-current={ansicht === eintrag.wert ? "true" : undefined}
              className={
                "rounded-md px-3 py-1.5 font-medium " +
                (ansicht === eintrag.wert
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {eintrag.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Monatsansicht ---------------------------------------------------- */}
        {ansicht === "monat" ? (
          <Card className="border-border/70">
            <CardContent className="p-2 sm:p-4">
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
                {WOCHENTAG_KURZ.map((wochentag) => (
                  <div key={wochentag} className="py-1">
                    {wochentag}
                  </div>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-1">
                {zellen.map((zelle, index) => {
                  if (zelle.tag === null) {
                    return (
                      <div
                        key={`leer-${index}`}
                        className="min-h-[68px] rounded-md bg-muted/30"
                      />
                    );
                  }
                  const istGewaehlt = zelle.tag === gewaehlterTag;
                  const istHeute = zelle.tag === heute;
                  const geschlossen = !geoeffneteTage.includes(zelle.tag);
                  return (
                    <Link
                      key={zelle.tag}
                      href={link("monat", monat, null, { tagSetzen: zelle.tag })}
                      aria-current={istGewaehlt ? "true" : undefined}
                      className={
                        "flex min-h-[68px] flex-col gap-1 rounded-md border p-1.5 text-left transition-colors sm:p-2 " +
                        (istGewaehlt
                          ? "border-brand bg-brand-soft"
                          : "border-border/70 bg-background hover:border-brand/40") +
                        (zelle.imMonat ? "" : " opacity-60")
                      }
                    >
                      <span className="flex items-center justify-between">
                        <span
                          className={
                            "text-sm font-semibold tabular-nums " +
                            (istHeute ? "text-brand" : "")
                          }
                        >
                          {Number(zelle.tag.slice(8, 10))}
                        </span>
                        {geschlossen && (
                          <span className="text-[10px] text-muted-foreground">
                            zu
                          </span>
                        )}
                      </span>
                      {zelle.terminAnzahl > 0 && (
                        <span className="flex flex-wrap gap-1">
                          <Badge variant="bestaetigt" className="px-1.5 py-0 text-[10px]">
                            {zelle.terminAnzahl} Termin{zelle.terminAnzahl === 1 ? "" : "e"}
                          </Badge>
                        </span>
                      )}
                      {zelle.anfrageAnzahl > 0 && (
                        <span className="text-[10px] font-medium text-brand">
                          {zelle.anfrageAnzahl} offene Anfrage
                          {zelle.anfrageAnzahl === 1 ? "" : "n"}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Ein Tag ist grün umrandet, wenn er ausgewählt ist. „zu“ markiert
                Tage, an denen die Werkstatt laut Öffnungszeiten geschlossen ist.
              </p>
            </CardContent>
          </Card>
        ) : (
          /* Wochenansicht -------------------------------------------------- */
          <Card className="border-border/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Wochenplan</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 p-2 sm:p-4">
              {zeitraum.tage.map((eintrag) => {
                const termineTag = termineJeTag.get(eintrag) ?? [];
                const anfragenTag = anfragenAmTag(offeneAnfragen, eintrag);
                const geschlossen = !geoeffneteTage.includes(eintrag);
                return (
                  <Link
                    key={eintrag}
                    href={link("woche", monatAusTag(eintrag), null, { tagSetzen: eintrag })}
                    aria-current={eintrag === gewaehlterTag ? "true" : undefined}
                    className={
                      "flex flex-col gap-1 rounded-md border px-2 py-2 text-sm transition-colors " +
                      (eintrag === gewaehlterTag
                        ? "border-brand bg-brand-soft"
                        : "border-border/60 hover:border-brand/40")
                    }
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {formatiereDatumKurz(eintrag)}
                      </span>
                      {eintrag === heute && <span className="text-xs text-brand">heute</span>}
                      {geschlossen && (
                        <span className="text-xs text-muted-foreground">geschlossen</span>
                      )}
                      {termineTag.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          keine Termine
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {termineTag.length} Termin{termineTag.length === 1 ? "" : "e"}
                        </span>
                      )}
                      {anfragenTag.length > 0 && (
                        <span className="text-xs font-medium text-brand">
                          {anfragenTag.length} offene Anfrage
                          {anfragenTag.length === 1 ? "" : "n"}
                        </span>
                      )}
                    </span>
                    {termineTag.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {termineTag
                          .map((termin) => `${termin.uhrzeit.split(" ")[0]} ${termin.titel}`)
                          .join(" · ")}
                      </span>
                    )}
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Tagesdetail ------------------------------------------------------ */}
        <Card className="border-border/70">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {gewaehlterTag
                ? formatiereDatumLang(gewaehlterTag)
                : "Kein Tag ausgewählt"}
            </CardTitle>
            {gewaehlterTag && (
              <p className="text-sm text-muted-foreground">
                {termineDesTages.length} Termin
                {termineDesTages.length === 1 ? "" : "e"} ·{" "}
                {anfragenDesTages.length} offene Anfrage
                {anfragenDesTages.length === 1 ? "" : "n"} mit Wunschzeitraum
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {!gewaehlterTag ? (
              <p className="text-sm text-muted-foreground">
                Wählen Sie im Kalender einen Tag aus, um Termine und offene
                Anfragen zu sehen.
              </p>
            ) : (
              <>
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Termine an diesem Tag
                  </h2>
                  {termineDesTages.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Für diesen Tag ist kein Termin eingetragen.
                    </p>
                  ) : (
                    <ul className="mt-1">
                      {termineDesTages.map((termin) => (
                        <TerminZeile key={termin.id} termin={termin} />
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Offene Anfragen für diesen Tag
                  </h2>
                  {anfragenDesTages.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Keine offene Anfrage mit diesem Tag im Wunschzeitraum.
                    </p>
                  ) : (
                    <ul className="mt-1">
                      {anfragenDesTages.map((anfrage) => (
                        <AnfrageZeile key={anfrage.id} anfrage={anfrage} />
                      ))}
                    </ul>
                  )}
                </div>

                {ohneZeitraum.length > 0 && (
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Offene Anfragen ohne Wunschzeitraum
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Diese Anfragen hängen an keinem bestimmten Tag:{" "}
                      {ohneZeitraum.map((anfrage, index) => (
                        <span key={anfrage.id}>
                          {index > 0 ? ", " : ""}
                          <Link
                            href={`/dashboard/anfragen/${anfrage.id}`}
                            className="font-medium text-brand hover:underline"
                          >
                            {anfrage.reference}
                          </Link>
                        </span>
                      ))}
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Alert variant="info">
        <AlertTitle>Mandanten-Trennung</AlertTitle>
        <AlertDescription>
          Diese Übersicht enthält ausschließlich Termine und Anfragen Ihrer
          eigenen Werkstatt — durchgesetzt in der Datenbank (Row Level Security),
          nicht nur in der Abfrage. Geprüft mit{" "}
          <code className="rounded bg-muted px-1">scripts/rls-check.sh</code>.
        </AlertDescription>
      </Alert>
    </div>
  );
}
