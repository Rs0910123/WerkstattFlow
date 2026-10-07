"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarCheck } from "lucide-react";

import { formatiereDatumLang, formatiereSlot } from "@/lib/portal/format.ts";
import type { Tagesangebot, TerminSlot } from "@/lib/portal/kalender.ts";
import type { Leistungsart } from "@/lib/portal/leistungen.ts";

import { AnfrageFormular } from "./anfrage-formular";
import { Kalender } from "./kalender";

/**
 * Der Kundenweg im Kundenportal (mobil zuerst): Kalender → Auswahl von Tag und
 * Slot → mehrstufiges Anfrageformular → Absenden.
 *
 * Tag und Slot gehören diesem Baustein, damit die Auswahl beim Wechsel in das
 * Formular erhalten bleibt (und beim Wechsel des Tages oder Slots sauber neu
 * aufgebaut wird — deshalb der `key` am Formular). Die verbindliche Prüfung
 * findet zusätzlich serverseitig in der Server Action statt.
 */
export function TerminFlow({
  slug,
  zeitzone,
  heute,
  tage,
  werkstattName,
  leistungen,
}: {
  slug: string;
  zeitzone: string;
  heute: string;
  tage: Tagesangebot[];
  werkstattName: string;
  leistungen: Leistungsart[];
}) {
  const [gewaehlterTag, setGewaehlterTag] = useState<string | null>(null);
  const [gewaehlterSlot, setGewaehlterSlot] = useState<TerminSlot | null>(null);
  const formularRef = useRef<HTMLDivElement>(null);
  const ersterAufbau = useRef(true);

  // Nach der Slot-Auswahl automatisch zum Formular führen (mobil wichtig,
  // weil Kalender und Formular untereinander stehen).
  useEffect(() => {
    if (ersterAufbau.current) {
      ersterAufbau.current = false;
      return;
    }
    if (gewaehlterTag && gewaehlterSlot) {
      formularRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [gewaehlterTag, gewaehlterSlot]);

  return (
    <div>
      <Kalender
        tage={tage}
        heute={heute}
        werkstattName={werkstattName}
        gewaehlterTag={gewaehlterTag}
        gewaehlterSlot={gewaehlterSlot}
        onTagWaehlen={setGewaehlterTag}
        onSlotWaehlen={setGewaehlterSlot}
      />

      <div id="anfrage" ref={formularRef} className="mt-8 scroll-mt-20">
        {gewaehlterTag && gewaehlterSlot ? (
          <AnfrageFormular
            key={`${gewaehlterTag}-${gewaehlterSlot.startMinute}-${gewaehlterSlot.endMinute}`}
            slug={slug}
            zeitzone={zeitzone}
            heute={heute}
            tag={gewaehlterTag}
            slot={gewaehlterSlot}
            werkstattName={werkstattName}
            leistungen={leistungen}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 p-6 text-center">
            <CalendarCheck className="mx-auto h-6 w-6 text-brand" />
            <p className="mt-3 font-medium">Erst den Wunschtermin wählen</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Bitte wählen Sie im Kalender oben einen freien Tag und eine Uhrzeit.
              Danach öffnet sich hier das Anfrageformular mit Fahrzeugdaten und
              Preisschätzung.
            </p>
            {gewaehlterTag && !gewaehlterSlot && (
              <p className="mt-3 text-sm text-brand">
                Tag gewählt: {formatiereDatumLang(gewaehlterTag)} — jetzt noch eine
                Uhrzeit auswählen.
              </p>
            )}
            {gewaehlterTag && gewaehlterSlot && (
              <p className="mt-3 text-sm text-brand">
                {formatiereDatumLang(gewaehlterTag)},{" "}
                {formatiereSlot(gewaehlterSlot.startMinute, gewaehlterSlot.endMinute)}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
