"use client";

import { useEffect, useMemo, useRef, useState, useActionState } from "react";
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Info,
  Send,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sendeAnfrage, type FormularZustand } from "@/lib/actions/anfrage.ts";
import {
  EINWILLIGUNG_FELD,
  HONEYPOT_FELD,
  KONTAKTWEGE,
  KONTAKTWEG_TEXTE,
  KRAFTSTOFF_OPTIONEN,
  type Kontaktweg,
} from "@/lib/portal/anfrage-schema.ts";
import {
  ANFRAGE_SCHRITTE,
  ANZAHL_SCHRITTE,
  ersterSchrittMitFehler,
  pruefeSchritt,
  sortiereFehler,
} from "@/lib/portal/anfrage-schritte.ts";
import {
  formatiereDatumLang,
  formatiereMinute,
  formatiereSlot,
} from "@/lib/portal/format.ts";
import type { Leistungsart } from "@/lib/portal/leistungen.ts";
import {
  PREISSCHAETZUNG_HINWEIS,
  formatiereSpanne,
  schaetzePreis,
} from "@/lib/portal/preisschaetzung.ts";
import { cn } from "@/lib/utils";

/**
 * Mehrstufiges Anfrageformular (mobil zuerst, deutsch).
 *
 * Schritt 1 Anliegen · 2 Fahrzeug · 3 Kontakt · 4 Abschluss mit Preisschätzung.
 *
 * Wichtig für den Absendeweg: Der gewählte Tag und der Slot kommen nicht aus
 * dem Formular, sondern aus der Auswahl im Kalender (Props von TerminFlow) und
 * gehen als versteckte Felder mit. Die Preisspanne in Schritt 4 ist eine
 * Vorschau derselben reinen Funktion, die der Server verwendet — verbindlich
 * ist ausschließlich die serverseitige Berechnung.
 *
 * Alle Schritte bleiben im DOM (nur versteckt), damit beim Absenden wirklich
 * alle Felder übertragen werden und kein Wert verloren geht.
 */

export type Terminauswahl = { startMinute: number; endMinute: number };

function zahlOderNull(wert: string): number | null {
  const ziffern = wert.replace(/[^\d]/g, "");
  if (ziffern === "") return null;
  const zahl = Number(ziffern);
  return Number.isFinite(zahl) ? zahl : null;
}

/** Anzeigetext der gewünschten Kontaktart (deutsch, mit sicherem Rückfall). */
function kontaktText(weg: string): string {
  return (KONTAKTWEGE as readonly string[]).includes(weg)
    ? KONTAKTWEG_TEXTE[weg as Kontaktweg]
    : KONTAKTWEG_TEXTE.email;
}

function Feld({
  id,
  label,
  fehler,
  hinweis,
  children,
}: {
  id: string;
  label: string;
  fehler?: string;
  hinweis?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {fehler ? (
        <p id={`${id}-fehler`} className="text-xs font-medium text-status-abgelehnt">
          {fehler}
        </p>
      ) : hinweis ? (
        <p id={`${id}-hinweis`} className="text-xs text-muted-foreground">
          {hinweis}
        </p>
      ) : null}
    </div>
  );
}

export function AnfrageFormular({
  slug,
  zeitzone,
  heute,
  tag,
  slot,
  werkstattName,
  leistungen,
}: {
  slug: string;
  zeitzone: string;
  heute: string;
  tag: string;
  slot: Terminauswahl;
  werkstattName: string;
  leistungen: Leistungsart[];
}) {
  const [schritt, setSchritt] = useState(0);
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({
    service_type: "",
    description: "",
    license_plate: "",
    vehicle_make: "",
    vehicle_model: "",
    vehicle_year: "",
    vehicle_mileage: "",
    vehicle_fuel_type: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    contact_preference: "email",
    [EINWILLIGUNG_FELD]: "",
  });

  const [zustand, formularAktion, wirdGesendet] = useActionState<
    FormularZustand,
    FormData
  >(sendeAnfrage, null);

  const kopfRef = useRef<HTMLDivElement>(null);
  const gesehen = useRef(0);

  // Antwort des Servers einarbeiten: deutsche Meldungen zeigen, Eingaben
  // erhalten und zum ersten fehlerhaften Schritt springen.
  useEffect(() => {
    if (!zustand || zustand.versuche === gesehen.current) return;
    gesehen.current = zustand.versuche;
    setFehler(zustand.fehler);
    setMeldung(zustand.meldung);
    if (Object.keys(zustand.werte).length > 0) {
      setForm((vorher) => ({ ...vorher, ...zustand.werte }));
    }
    const ziel = ersterSchrittMitFehler(zustand.fehler);
    if (ziel >= 0) setSchritt(ziel);
    kopfRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [zustand]);

  const slotStart = formatiereMinute(slot.startMinute);
  const slotEnde = formatiereMinute(slot.endMinute);

  const eingabe = useMemo(
    () => ({
      ...form,
      preferred_date: tag,
      slot_start: slotStart,
      slot_end: slotEnde,
    }),
    [form, tag, slotStart, slotEnde],
  );

  const preis = useMemo(
    () =>
      schaetzePreis(form.service_type, {
        baujahr: zahlOderNull(form.vehicle_year),
        kilometerstand: zahlOderNull(form.vehicle_mileage),
        kraftstoff: form.vehicle_fuel_type || null,
      }),
    [form.service_type, form.vehicle_year, form.vehicle_mileage, form.vehicle_fuel_type],
  );

  function setze(feld: string, wert: string) {
    setForm((vorher) => ({ ...vorher, [feld]: wert }));
    setFehler((vorher) => {
      if (!vorher[feld]) return vorher;
      const neu = { ...vorher };
      delete neu[feld];
      return neu;
    });
    setMeldung(null);
  }

  function weiter() {
    const schrittFehler = pruefeSchritt(eingabe, schritt, { heute });
    if (Object.keys(schrittFehler).length > 0) {
      setFehler(schrittFehler);
      setMeldung("Bitte prüfen Sie die markierten Felder.");
      kopfRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setFehler({});
    setMeldung(null);
    setSchritt((vorher) => Math.min(ANZAHL_SCHRITTE - 1, vorher + 1));
    kopfRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function zurueck() {
    setFehler({});
    setMeldung(null);
    setSchritt((vorher) => Math.max(0, vorher - 1));
    kopfRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const fahrzeugText = [form.vehicle_make, form.vehicle_model]
    .filter((wert) => wert.trim() !== "")
    .join(" ");
  const alleFehler = sortiereFehler(fehler);

  return (
    <form
      action={formularAktion}
      className="rounded-xl border border-border/70 bg-background p-4 shadow-sm sm:p-6"
      noValidate
    >
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="zeitzone" value={zeitzone} />
      <input type="hidden" name="preferred_date" value={tag} />
      <input type="hidden" name="slot_start" value={slotStart} />
      <input type="hidden" name="slot_end" value={slotEnde} />
      {/* Spamschutz: bleibt für Menschen leer. */}
      <div className="absolute -left-[9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor={HONEYPOT_FELD}>Website</label>
        <input
          id={HONEYPOT_FELD}
          name={HONEYPOT_FELD}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={form[HONEYPOT_FELD] ?? ""}
          onChange={(ereignis) => setForm((v) => ({ ...v, [HONEYPOT_FELD]: ereignis.target.value }))}
        />
      </div>

      <div ref={kopfRef} className="scroll-mt-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold sm:text-2xl">Termin anfragen</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Wunschtermin:{" "}
              <span className="font-medium text-foreground">
                {formatiereDatumLang(tag)}, {formatiereSlot(slot.startMinute, slot.endMinute)}
              </span>
            </p>
          </div>
          <Badge variant="neu">
            Schritt {schritt + 1} von {ANZAHL_SCHRITTE}
          </Badge>
        </div>

        {/* Fortschrittsanzeige -------------------------------------------------- */}
        <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Fortschritt">
          {ANFRAGE_SCHRITTE.map((eintrag, index) => {
            const erledigt = index < schritt;
            const aktiv = index === schritt;
            return (
              <li key={eintrag.titel} className="flex flex-col gap-1.5">
                <span
                  className={cn(
                    "h-1.5 rounded-full",
                    erledigt || aktiv ? "bg-brand" : "bg-muted",
                  )}
                />
                <span
                  className={cn(
                    "flex items-center gap-1 text-[0.7rem] leading-tight sm:text-xs",
                    aktiv ? "font-semibold text-brand" : "text-muted-foreground",
                  )}
                >
                  {erledigt && <Check className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{eintrag.titel}</span>
                </span>
              </li>
            );
          })}
        </ol>

        {meldung && (
          <div className="mt-5 flex gap-2 rounded-lg border border-status-abgelehnt/30 bg-status-abgelehnt/10 p-3 text-sm text-status-abgelehnt">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">{meldung}</p>
              {alleFehler.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-xs">
                  {alleFehler.slice(0, 6).map((eintrag) => (
                    <li key={eintrag.feld}>{eintrag.meldung}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        {meldung ?? ""}
      </p>

      {/* Schritt 1: Anliegen -------------------------------------------------- */}
      <section hidden={schritt !== 0} className={cn("mt-6 space-y-5", schritt !== 0 && "hidden")}>
        <div>
          <h3 className="font-semibold">{ANFRAGE_SCHRITTE[0].titel}</h3>
          <p className="text-sm text-muted-foreground">{ANFRAGE_SCHRITTE[0].beschreibung}</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Leistung</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {leistungen.map((leistung) => {
              const gewaehlt = form.service_type === leistung.label;
              return (
                <label
                  key={leistung.label}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition",
                    gewaehlt
                      ? "border-brand bg-brand-soft"
                      : "border-border/70 hover:border-brand/50",
                  )}
                >
                  <input
                    type="radio"
                    name="service_type"
                    value={leistung.label}
                    checked={gewaehlt}
                    onChange={(ereignis) => setze("service_type", ereignis.target.value)}
                    className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]"
                  />
                  <span>
                    <span className="block font-medium">{leistung.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {leistung.beschreibung}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {leistung.dauer}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {fehler.service_type && (
            <p className="text-xs font-medium text-status-abgelehnt">{fehler.service_type}</p>
          )}
        </fieldset>

        <Feld
          id="description"
          label="Beschreibung des Anliegens (optional)"
          fehler={fehler.description}
          hinweis="Was ist aufgefallen? Geräusche, Warnleuchten, seit wann — hilfreiche Angaben sparen Zeit."
        >
          <Textarea
            id="description"
            name="description"
            rows={4}
            maxLength={2000}
            value={form.description}
            onChange={(ereignis) => setze("description", ereignis.target.value)}
            aria-invalid={Boolean(fehler.description)}
            placeholder="z. B. Quietschen beim Bremsen seit zwei Wochen, Bremslicht leuchtet manchmal."
          />
        </Feld>
      </section>

      {/* Schritt 2: Fahrzeug -------------------------------------------------- */}
      <section hidden={schritt !== 1} className={cn("mt-6 space-y-5", schritt !== 1 && "hidden")}>
        <div>
          <h3 className="font-semibold">{ANFRAGE_SCHRITTE[1].titel}</h3>
          <p className="text-sm text-muted-foreground">{ANFRAGE_SCHRITTE[1].beschreibung}</p>
        </div>

        <Feld id="license_plate" label="Kennzeichen" fehler={fehler.license_plate}>
          <Input
            id="license_plate"
            name="license_plate"
            value={form.license_plate}
            onChange={(ereignis) => setze("license_plate", ereignis.target.value.toUpperCase())}
            aria-invalid={Boolean(fehler.license_plate)}
            placeholder="z. B. WU-AB 123"
            autoComplete="off"
          />
        </Feld>

        <div className="grid gap-4 sm:grid-cols-2">
          <Feld id="vehicle_make" label="Marke" fehler={fehler.vehicle_make}>
            <Input
              id="vehicle_make"
              name="vehicle_make"
              value={form.vehicle_make}
              onChange={(ereignis) => setze("vehicle_make", ereignis.target.value)}
              aria-invalid={Boolean(fehler.vehicle_make)}
              placeholder="z. B. Volkswagen"
            />
          </Feld>
          <Feld id="vehicle_model" label="Modell" fehler={fehler.vehicle_model}>
            <Input
              id="vehicle_model"
              name="vehicle_model"
              value={form.vehicle_model}
              onChange={(ereignis) => setze("vehicle_model", ereignis.target.value)}
              aria-invalid={Boolean(fehler.vehicle_model)}
              placeholder="z. B. Golf 7"
            />
          </Feld>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Feld
            id="vehicle_year"
            label="Baujahr (optional)"
            fehler={fehler.vehicle_year}
            hinweis="Fließt in die Preisschätzung ein."
          >
            <Input
              id="vehicle_year"
              name="vehicle_year"
              inputMode="numeric"
              value={form.vehicle_year}
              onChange={(ereignis) => setze("vehicle_year", ereignis.target.value)}
              aria-invalid={Boolean(fehler.vehicle_year)}
              placeholder="2019"
            />
          </Feld>
          <Feld
            id="vehicle_mileage"
            label="Kilometerstand (optional)"
            fehler={fehler.vehicle_mileage}
            hinweis="Zahl ohne Punkt, z. B. 118400."
          >
            <Input
              id="vehicle_mileage"
              name="vehicle_mileage"
              inputMode="numeric"
              value={form.vehicle_mileage}
              onChange={(ereignis) => setze("vehicle_mileage", ereignis.target.value)}
              aria-invalid={Boolean(fehler.vehicle_mileage)}
              placeholder="118400"
            />
          </Feld>
          <Feld id="vehicle_fuel_type" label="Kraftstoff (optional)" fehler={fehler.vehicle_fuel_type}>
            <select
              id="vehicle_fuel_type"
              name="vehicle_fuel_type"
              value={form.vehicle_fuel_type}
              onChange={(ereignis) => setze("vehicle_fuel_type", ereignis.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              <option value="">Keine Angabe</option>
              {KRAFTSTOFF_OPTIONEN.map((option) => (
                <option key={option.wert} value={option.wert}>
                  {option.label}
                </option>
              ))}
            </select>
          </Feld>
        </div>
      </section>

      {/* Schritt 3: Kontakt --------------------------------------------------- */}
      <section hidden={schritt !== 2} className={cn("mt-6 space-y-5", schritt !== 2 && "hidden")}>
        <div>
          <h3 className="font-semibold">{ANFRAGE_SCHRITTE[2].titel}</h3>
          <p className="text-sm text-muted-foreground">{ANFRAGE_SCHRITTE[2].beschreibung}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Feld id="first_name" label="Vorname" fehler={fehler.first_name}>
            <Input
              id="first_name"
              name="first_name"
              value={form.first_name}
              onChange={(ereignis) => setze("first_name", ereignis.target.value)}
              aria-invalid={Boolean(fehler.first_name)}
              autoComplete="given-name"
            />
          </Feld>
          <Feld id="last_name" label="Nachname" fehler={fehler.last_name}>
            <Input
              id="last_name"
              name="last_name"
              value={form.last_name}
              onChange={(ereignis) => setze("last_name", ereignis.target.value)}
              aria-invalid={Boolean(fehler.last_name)}
              autoComplete="family-name"
            />
          </Feld>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Feld
            id="email"
            label="E-Mail-Adresse"
            fehler={fehler.email}
            hinweis="Für die Bestätigung Ihrer Anfrage."
          >
            <Input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={(ereignis) => setze("email", ereignis.target.value)}
              aria-invalid={Boolean(fehler.email)}
              autoComplete="email"
            />
          </Feld>
          <Feld id="phone" label="Telefonnummer" fehler={fehler.phone}>
            <Input
              id="phone"
              name="phone"
              type="tel"
              value={form.phone}
              onChange={(ereignis) => setze("phone", ereignis.target.value)}
              aria-invalid={Boolean(fehler.phone)}
              autoComplete="tel"
              placeholder="z. B. 0202 1234567"
            />
          </Feld>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Gewünschte Kontaktart</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {KONTAKTWEGE.map((weg) => (
              <label
                key={weg}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm",
                  form.contact_preference === weg
                    ? "border-brand bg-brand-soft"
                    : "border-border/70 hover:border-brand/50",
                )}
              >
                <input
                  type="radio"
                  name="contact_preference"
                  value={weg}
                  checked={form.contact_preference === weg}
                  onChange={(ereignis) => setze("contact_preference", ereignis.target.value)}
                  className="h-4 w-4 accent-[hsl(var(--brand))]"
                />
                {KONTAKTWEG_TEXTE[weg]}
              </label>
            ))}
          </div>
          {fehler.contact_preference && (
            <p className="text-xs font-medium text-status-abgelehnt">
              {fehler.contact_preference}
            </p>
          )}
        </fieldset>

        <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              name={EINWILLIGUNG_FELD}
              value="on"
              checked={form[EINWILLIGUNG_FELD] === "on"}
              onChange={(ereignis) =>
                setze(EINWILLIGUNG_FELD, ereignis.target.checked ? "on" : "")
              }
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--brand))]"
              aria-invalid={Boolean(fehler[EINWILLIGUNG_FELD])}
            />
            <span>
              Ja, wir dürfen Sie zu dieser Anfrage kontaktieren.
              <span className="mt-1 block text-xs text-muted-foreground">
                Ihre Angaben werden ausschließlich für diese Anfrage bei{" "}
                {werkstattName} verwendet. Pflichtangabe.
              </span>
            </span>
          </label>
          {fehler[EINWILLIGUNG_FELD] && (
            <p className="mt-2 text-xs font-medium text-status-abgelehnt">
              {fehler[EINWILLIGUNG_FELD]}
            </p>
          )}
        </div>
      </section>

      {/* Schritt 4: Abschluss ------------------------------------------------- */}
      <section hidden={schritt !== 3} className={cn("mt-6 space-y-5", schritt !== 3 && "hidden")}>
        <div>
          <h3 className="font-semibold">{ANFRAGE_SCHRITTE[3].titel}</h3>
          <p className="text-sm text-muted-foreground">{ANFRAGE_SCHRITTE[3].beschreibung}</p>
        </div>

        <dl className="divide-y divide-border/70 rounded-lg border border-border/70 text-sm">
          <div className="flex flex-wrap justify-between gap-2 p-3">
            <dt className="text-muted-foreground">Wunschtermin</dt>
            <dd className="font-medium">
              {formatiereDatumLang(tag)}, {formatiereSlot(slot.startMinute, slot.endMinute)}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-2 p-3">
            <dt className="text-muted-foreground">Leistung</dt>
            <dd className="font-medium">{form.service_type || "—"}</dd>
          </div>
          {form.description.trim() !== "" && (
            <div className="flex flex-wrap justify-between gap-2 p-3">
              <dt className="text-muted-foreground">Beschreibung</dt>
              <dd className="max-w-prose text-right">{form.description}</dd>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2 p-3">
            <dt className="text-muted-foreground">Fahrzeug</dt>
            <dd className="font-medium">
              {[fahrzeugText, form.license_plate].filter((wert) => wert.trim() !== "").join(" · ") ||
                "—"}
            </dd>
          </div>
          {(form.vehicle_year.trim() !== "" || form.vehicle_mileage.trim() !== "") && (
            <div className="flex flex-wrap justify-between gap-2 p-3">
              <dt className="text-muted-foreground">Baujahr / Kilometerstand</dt>
              <dd className="font-medium">
                {[
                  form.vehicle_year.trim() !== "" ? form.vehicle_year : null,
                  form.vehicle_mileage.trim() !== ""
                    ? `${form.vehicle_mileage} km`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2 p-3">
            <dt className="text-muted-foreground">Kontakt</dt>
            <dd className="max-w-prose text-right font-medium">
              {[form.first_name, form.last_name].filter((wert) => wert.trim() !== "").join(" ")}
              {form.email.trim() !== "" && <> · {form.email}</>}
              {form.phone.trim() !== "" && <> · {form.phone}</>}
              <span className="block text-xs font-normal text-muted-foreground">
                Kontaktart: {kontaktText(form.contact_preference)}
              </span>
            </dd>
          </div>
        </dl>

        {/* Preisschätzung ------------------------------------------------------ */}
        <div className="rounded-lg border border-brand/30 bg-brand-soft/70 p-4">
          <p className="text-sm font-medium text-brand">Unverbindliche Preisschätzung</p>
          {preis ? (
            <>
              <p className="mt-1 text-2xl font-semibold">{formatiereSpanne(preis.min, preis.max)}</p>
              {preis.gruende.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                  {preis.gruende.map((grund) => (
                    <li key={grund}>{grund}</li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Bitte wählen Sie in Schritt 1 eine Leistung — dann erscheint hier die
              Preisspanne.
            </p>
          )}
          <p className="mt-3 flex gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {PREISSCHAETZUNG_HINWEIS}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Mit dem Absenden geben Sie uns Ihre Angaben für diese Anfrage. Es
          entsteht kein Vertrag — {werkstattName} meldet sich mit der
          Bestätigung.
        </p>
      </section>

      {/* Navigation ----------------------------------------------------------- */}
      <div className="mt-6 flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={zurueck}
          disabled={schritt === 0 || wirdGesendet}
          className="sm:w-auto"
        >
          <ChevronLeft className="mr-2 h-4 w-4" />
          Zurück
        </Button>

        {schritt < ANZAHL_SCHRITTE - 1 ? (
          <Button type="button" onClick={weiter} className="sm:min-w-40">
            Weiter
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={wirdGesendet} className="sm:min-w-48">
            <Send className="mr-2 h-4 w-4" />
            {wirdGesendet ? "Wird gesendet …" : "Anfrage absenden"}
          </Button>
        )}
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Nach dem Absenden erhalten Sie eine Referenznummer und eine Seite, auf der
        Sie den Stand Ihrer Anfrage jederzeit verfolgen können.
      </p>

      {/* Fortschritt der Eingaben für Hilfsmittel (Screenreader) */}
      <p className="sr-only">
        Aktueller Schritt: {ANFRAGE_SCHRITTE[schritt]?.titel ?? ""} ({schritt + 1} von{" "}
        {ANZAHL_SCHRITTE})
      </p>
    </form>
  );
}
