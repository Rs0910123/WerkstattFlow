"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  formatiereDatumKurz,
  formatiereDatumLang,
  formatiereMonat,
  formatiereSlot,
} from "@/lib/portal/format.ts";
import {
  monatsRaster,
  type Tagesangebot,
  type TerminSlot,
} from "@/lib/portal/kalender.ts";

/**
 * Monatskalender des Kundenportals (mobil zuerst).
 *
 * Der Kalender rechnet NICHT selbst: Er bekommt die fertig berechneten Tage
 * (freie/belegte/geschlossene Tage samt Slots) von der Serverseite und zeigt sie
 * nur an. Damit gibt es keine zweite Wahrheit über freie Termine.
 */

const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export function Kalender({
  tage,
  heute,
  werkstattName,
}: {
  tage: Tagesangebot[];
  heute: string;
  werkstattName: string;
}) {
  const nachDatum = useMemo(() => {
    const karte = new Map<string, Tagesangebot>();
    for (const tag of tage) karte.set(tag.datum, tag);
    return karte;
  }, [tage]);

  const [jahr, setJahr] = useState(() => Number(heute.slice(0, 4)));
  const [monat, setMonat] = useState(() => Number(heute.slice(5, 7)));
  const [gewaehlterTag, setGewaehlterTag] = useState<string | null>(null);
  const [gewaehlterSlot, setGewaehlterSlot] = useState<TerminSlot | null>(null);

  const raster = useMemo(() => monatsRaster(jahr, monat), [jahr, monat]);

  const ersterTag = tage[0]?.datum ?? heute;
  const letzterTag = tage.at(-1)?.datum ?? heute;

  function blaettern(schritt: number) {
    const neuerMonat = monat + schritt;
    if (neuerMonat < 1) {
      setMonat(12);
      setJahr(jahr - 1);
    } else if (neuerMonat > 12) {
      setMonat(1);
      setJahr(jahr + 1);
    } else {
      setMonat(neuerMonat);
    }
    setGewaehlterSlot(null);
    setGewaehlterTag(null);
  }

  const monatsAnfang = `${jahr}-${String(monat).padStart(2, "0")}-01`;
  const vorherMoeglich = monatsAnfang > ersterTag;
  const nachherMoeglich = monatsAnfang < letzterTag.slice(0, 8) + "01";

  const gewaehlterTagDaten = gewaehlterTag ? nachDatum.get(gewaehlterTag) : undefined;

  return (
    <div className="rounded-xl border border-border/70 bg-background p-4 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-brand" />
          <div>
            <p className="font-semibold leading-tight">{formatiereMonat(jahr, monat)}</p>
            <p className="text-xs text-muted-foreground">
              Freie Tage auf einen Blick — bitte einen Tag wählen.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Vorheriger Monat"
            disabled={!vorherMoeglich}
            onClick={() => blaettern(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Nächster Monat"
            disabled={!nachherMoeglich}
            onClick={() => blaettern(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground">
        {WOCHENTAGE_KURZ.map((kurz) => (
          <span key={kurz} className="py-1">
            {kurz}
          </span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {raster.map((datum, index) => {
          if (datum === null) {
            return <span key={`leer-${index}`} className="min-h-[3.25rem]" />;
          }
          const angebot = nachDatum.get(datum);
          const tag = Number(datum.slice(8, 10));

          if (!angebot) {
            return (
              <span
                key={datum}
                className="flex min-h-[3.25rem] flex-col items-center justify-center rounded-md text-xs text-muted-foreground/50"
              >
                {tag}
              </span>
            );
          }

          const frei = angebot.zustand === "frei";
          const istGewaehlt = datum === gewaehlterTag;
          const grund =
            angebot.zustand === "geschlossen"
              ? "geschlossen"
              : angebot.zustand === "ausgebucht"
                ? "ausgebucht"
                : angebot.zustand === "vorlauf"
                  ? "zu kurzfristig"
                  : `${angebot.freieSlots} frei`;

          return (
            <button
              key={datum}
              type="button"
              disabled={!frei}
              aria-label={`${formatiereDatumLang(datum)}: ${grund}`}
              onClick={() => {
                setGewaehlterTag(datum);
                setGewaehlterSlot(null);
              }}
              className={[
                "flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 rounded-md border px-1 text-xs transition",
                frei
                  ? "border-brand/30 bg-brand-soft font-semibold text-brand hover:border-brand"
                  : "border-transparent bg-muted/60 text-muted-foreground",
                angebot.zustand === "ausgebucht" ? "line-through decoration-muted-foreground/50" : "",
                istGewaehlt ? "ring-2 ring-brand ring-offset-1" : "",
              ].join(" ")}
            >
              <span className="text-sm">{tag}</span>
              <span className="text-[0.65rem] leading-tight">{grund}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-brand/30 bg-brand-soft" />
          freie Termine
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-muted-foreground/30" />
          belegt oder geschlossen
        </span>
        <span className="flex items-center gap-1.5">
          <Clock className="h-3 w-3" />
          Termine erst 24 Stunden im Voraus
        </span>
      </div>

      {gewaehlterTagDaten && gewaehlterTagDaten.slots.length > 0 && (
        <div className="mt-6 rounded-lg border border-border/70 bg-muted/30 p-4">
          <p className="font-medium">{formatiereDatumLang(gewaehlterTagDaten.datum)}</p>
          {gewaehlterTagDaten.oeffnungszeit && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Annahme {gewaehlterTagDaten.oeffnungszeit}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {gewaehlterTagDaten.slots.map((slot) => {
              const ausgewaehlt =
                gewaehlterSlot?.startMinute === slot.startMinute &&
                gewaehlterSlot?.endMinute === slot.endMinute;
              return (
                <button
                  key={slot.startMinute}
                  type="button"
                  disabled={!slot.frei}
                  onClick={() => setGewaehlterSlot(slot)}
                  className={[
                    "rounded-md border px-3 py-1.5 text-sm transition",
                    slot.frei
                      ? "border-brand/30 bg-background hover:border-brand"
                      : "cursor-not-allowed border-transparent bg-muted text-muted-foreground line-through",
                    ausgewaehlt ? "border-brand bg-brand text-brand-fg" : "",
                  ].join(" ")}
                >
                  {formatiereSlot(slot.startMinute, slot.endMinute)}
                </button>
              );
            })}
          </div>

          {gewaehlterSlot && (
            <div className="mt-5 rounded-lg border border-brand/30 bg-background p-4">
              <Badge variant="bestaetigt" className="mb-2">
                <Check className="mr-1 h-3 w-3" />
                Auswahl
              </Badge>
              <p className="font-medium">
                {formatiereDatumLang(gewaehlterTagDaten.datum)},{" "}
                {formatiereSlot(gewaehlterSlot.startMinute, gewaehlterSlot.endMinute)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Im nächsten Schritt führt diese Auswahl direkt in das
                Anfrageformular mit Fahrzeugdaten und Preisschätzung. Der
                Formularschritt folgt in Kürze — bis dahin nimmt{" "}
                {werkstattName} Ihren Wunschtermin gern telefonisch entgegen.
              </p>
              <Button type="button" className="mt-4" disabled>
                Weiter zur Anfrage (folgt)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Kleine Vorschau der nächsten freien Tage (Startbereich der Werkstattseite). */
export function NaechsteFreieTage({ tage }: { tage: Tagesangebot[] }) {
  if (tage.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Derzeit sind keine Termine online frei — bitte rufen Sie die Werkstatt an.
      </p>
    );
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {tage.map((tag) => (
        <li
          key={tag.datum}
          className="rounded-md border border-brand/30 bg-brand-soft px-3 py-1.5 text-sm font-medium text-brand"
        >
          {formatiereDatumKurz(tag.datum)}
        </li>
      ))}
    </ul>
  );
}
