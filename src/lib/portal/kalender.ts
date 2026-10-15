/**
 * Berechnung der freien Tage und Termin-Slots für den Kundenkalender.
 *
 * Reine Logik: Der Funktion werden die Verfügbarkeitsregeln der Werkstatt, die
 * belegten Zeitfenster, die aktuelle Werkstatt-Zeit und die Vorlaufzeit
 * übergeben. Sie greift NICHT auf Supabase oder die aktuelle Uhrzeit zu und ist
 * damit ohne Datenbank prüfbar (tests/kalender.test.ts).
 *
 * Fachliche Regeln (siehe auch Abschlussbericht, Punkt „Annahmen“):
 *   * Wiederkehrende Regel (weekday) gilt für alle Termine dieses Wochentags;
 *     eine Ausnahme (specific_date, z. B. Betriebsferien) hat Vorrang.
 *   * Aus dem Zeitfenster eines Tages entstehen Slots im Raster
 *     `slot_minutes` (je Wochentag, sonst `slotMinutenFallback` der Werkstatt).
 *   * Ein Slot ist frei, wenn weniger als `capacity` bestätigte/geplante
 *     Termine in ihn hineinreichen.
 *   * Ein Slot liegt zu kurzfristig, wenn sein Beginn weniger als
 *     `vorlaufStunden` in der Zukunft liegt.
 *   * Zustand eines Tages: "geschlossen" (keine Zeiten/Ausnahme geschlossen),
 *     "ausgebucht" (Slots vorhanden, aber alle belegt), "vorlauf" (alle Slots
 *     wegen Vorlaufzeit gesperrt) oder "frei".
 */

import {
  WOCHENTAG_NAMEN,
  datumPlusTage,
  formatiereDatum,
  formatiereMinute,
  formatiereSlot,
  minutenZwischen,
  tageZwischen,
  uhrzeitZuMinuten,
  vergleicheDatum,
  wochentagIso,
} from "./format.ts";

/** Standard-Vorlaufzeit: Termine sind mindestens 24 Stunden im Voraus möglich. */
export const VORLAUF_STUNDEN = 24;

/** Wie weit im Voraus kann gebucht werden? */
export const HORIZONT_TAGE = 60;

/** Sicherheitsnetz gegen absurde Zeitfenster. */
export const MAX_SLOTS_PRO_TAG = 32;

export type Verfuegbarkeitsregel = {
  weekday: number | null;
  specific_date: string | null;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
  slot_minutes: number | null;
  capacity: number;
  note: string | null;
};

export type Auslastungsfenster = {
  day: string;
  startsMinute: number;
  endsMinute: number;
};

export type Tageszustand = "frei" | "ausgebucht" | "geschlossen" | "vorlauf";

export type TerminSlot = {
  startMinute: number;
  endMinute: number;
  /** z. B. "08:00–09:00 Uhr" */
  label: string;
  frei: boolean;
  grund: "belegt" | "vorlauf" | null;
};

export type Tagesangebot = {
  datum: string;
  wochentag: number;
  zustand: Tageszustand;
  oeffnungszeit: string | null;
  hinweis: string | null;
  slots: TerminSlot[];
  freieSlots: number;
};

export type OeffnungszeitZeile = {
  label: string;
  zeit: string;
  geschlossen: boolean;
  hinweis: string | null;
};

export type OeffnungszeitenBild = {
  wochentage: OeffnungszeitZeile[];
  ausnahmen: OeffnungszeitZeile[];
};

export type KalenderEingabe = {
  regeln: Verfuegbarkeitsregel[];
  auslastung: Auslastungsfenster[];
  von: string;
  bis: string;
  /** Aktuelle Werkstatt-Zeit, naiv: "YYYY-MM-DDTHH:MM". */
  jetzt: string;
  vorlaufStunden?: number;
  slotMinutenFallback?: number;
};

/** Regel für einen konkreten Tag: Ausnahme schlägt Wochentag. */
export function findeRegel(
  regeln: Verfuegbarkeitsregel[],
  datum: string,
  wochentag: number = wochentagIso(datum),
): Verfuegbarkeitsregel | null {
  const ausnahme = regeln.find((regel) => regel.specific_date === datum);
  if (ausnahme) return ausnahme;
  return regeln.find((regel) => regel.weekday === wochentag) ?? null;
}

/** Slots aus Öffnungs- und Schließzeit bilden. */
export function erzeugeSlots(
  openMinute: number,
  closeMinute: number,
  slotMinuten: number,
  maxSlots: number = MAX_SLOTS_PRO_TAG,
): { startMinute: number; endMinute: number }[] {
  const slots: { startMinute: number; endMinute: number }[] = [];
  if (!Number.isFinite(slotMinuten) || slotMinuten <= 0) return slots;
  if (closeMinute <= openMinute) return slots;

  for (
    let start = openMinute;
    start + slotMinuten <= closeMinute && slots.length < maxSlots;
    start += slotMinuten
  ) {
    slots.push({ startMinute: start, endMinute: start + slotMinuten });
  }
  return slots;
}

function belegteSlotsFuer(
  auslastung: Auslastungsfenster[],
  datum: string,
  startMinute: number,
  endMinute: number,
): number {
  return auslastung.filter(
    (fenster) =>
      fenster.day === datum &&
      fenster.startsMinute < endMinute &&
      fenster.endsMinute > startMinute,
  ).length;
}

/** Ein einzelner Tag inklusive auswählbarer Slots. */
export function berechneTag(
  datum: string,
  eingabe: Omit<KalenderEingabe, "von" | "bis">,
): Tagesangebot {
  const wochentag = wochentagIso(datum);
  const vorlaufStunden = eingabe.vorlaufStunden ?? VORLAUF_STUNDEN;
  const fallback = eingabe.slotMinutenFallback ?? 60;
  const regel = findeRegel(eingabe.regeln, datum, wochentag);

  const leer: Tagesangebot = {
    datum,
    wochentag,
    zustand: "geschlossen",
    oeffnungszeit: null,
    hinweis: null,
    slots: [],
    freieSlots: 0,
  };

  if (!regel) {
    return { ...leer, hinweis: "An diesem Wochentag nimmt die Werkstatt keine Termine an." };
  }

  if (regel.is_closed) {
    return {
      ...leer,
      hinweis:
        regel.note && regel.note.trim() !== ""
          ? regel.note
          : "An diesem Tag ist die Werkstatt geschlossen.",
    };
  }

  const openMinute = uhrzeitZuMinuten(regel.open_time);
  const closeMinute = uhrzeitZuMinuten(regel.close_time);
  if (openMinute === null || closeMinute === null) {
    return { ...leer, hinweis: "Für diesen Tag sind noch keine Zeiten gepflegt." };
  }

  const slotMinuten = Math.max(
    15,
    Math.round(regel.slot_minutes ?? fallback),
  );
  const capacity = Math.max(1, regel.capacity ?? 1);
  const roheSlots = erzeugeSlots(openMinute, closeMinute, slotMinuten);

  let wartetAufVorlauf = true;
  const slots: TerminSlot[] = roheSlots.map((slot) => {
    const belegt = belegteSlotsFuer(
      eingabe.auslastung,
      datum,
      slot.startMinute,
      slot.endMinute,
    );
    const zuKurzfristig =
      minutenZwischen(
        eingabe.jetzt,
        `${datum}T${formatiereMinute(slot.startMinute)}`,
      ) <
      vorlaufStunden * 60;

    if (belegt >= capacity) {
      wartetAufVorlauf = false;
      return {
        ...slot,
        label: formatiereSlot(slot.startMinute, slot.endMinute),
        frei: false,
        grund: "belegt",
      };
    }
    if (zuKurzfristig) {
      return {
        ...slot,
        label: formatiereSlot(slot.startMinute, slot.endMinute),
        frei: false,
        grund: "vorlauf",
      };
    }
    wartetAufVorlauf = false;
    return {
      ...slot,
      label: formatiereSlot(slot.startMinute, slot.endMinute),
      frei: true,
      grund: null,
    };
  });

  const freieSlots = slots.filter((slot) => slot.frei).length;
  const oeffnungszeit = `${formatiereMinute(openMinute)}–${formatiereMinute(
    closeMinute,
  )} Uhr`;

  if (slots.length === 0) {
    return {
      ...leer,
      oeffnungszeit,
      hinweis: "Für diesen Tag sind keine Termine vorgesehen.",
    };
  }

  if (freieSlots > 0) {
    return {
      datum,
      wochentag,
      zustand: "frei",
      oeffnungszeit,
      hinweis: null,
      slots,
      freieSlots,
    };
  }

  if (wartetAufVorlauf) {
    return {
      datum,
      wochentag,
      zustand: "vorlauf",
      oeffnungszeit,
      hinweis: `Termine sind erst ${vorlaufStunden} Stunden im Voraus möglich.`,
      slots,
      freieSlots: 0,
    };
  }

  return {
    datum,
    wochentag,
    zustand: "ausgebucht",
    oeffnungszeit,
    hinweis: "An diesem Tag sind alle Termine vergeben.",
    slots,
    freieSlots: 0,
  };
}

/** Alle Tage eines Zeitraums (einschließlich beider Grenzen). */
export function berechneTagesangebote(eingabe: KalenderEingabe): Tagesangebot[] {
  const { von, bis } = eingabe;
  if (vergleicheDatum(von, bis) > 0) return [];
  const anzahl = Math.min(tageZwischen(von, bis) + 1, 400);
  const tage: Tagesangebot[] = [];
  for (let i = 0; i < anzahl; i += 1) {
    tage.push(berechneTag(datumPlusTage(von, i), eingabe));
  }
  return tage;
}

/** Die nächsten freien Tage — für die Startseite ("nächste freie Termine"). */
export function naechsteFreieTage(
  angebote: Tagesangebot[],
  anzahl: number,
): Tagesangebot[] {
  return angebote.filter((tag) => tag.zustand === "frei").slice(0, anzahl);
}

/** Öffnungszeiten in verständlicher Form (Startseite der Werkstatt). */
export function beschreibeOeffnungszeiten(
  regeln: Verfuegbarkeitsregel[],
): OeffnungszeitenBild {
  const wochentage: OeffnungszeitZeile[] = [];
  for (let wochentag = 1; wochentag <= 7; wochentag += 1) {
    const regel = regeln.find((eintrag) => eintrag.weekday === wochentag);
    if (!regel) continue;
    const open = uhrzeitZuMinuten(regel.open_time);
    const close = uhrzeitZuMinuten(regel.close_time);
    wochentage.push({
      label: WOCHENTAG_NAMEN[wochentag],
      zeit:
        regel.is_closed || open === null || close === null
          ? "geschlossen"
          : `${formatiereMinute(open)}–${formatiereMinute(close)} Uhr`,
      geschlossen: regel.is_closed || open === null || close === null,
      hinweis: null,
    });
  }

  const ausnahmen: OeffnungszeitZeile[] = regeln
    .filter((regel) => regel.specific_date !== null)
    .sort((a, b) => vergleicheDatum(a.specific_date ?? "", b.specific_date ?? ""))
    .map((regel) => ({
      label: formatiereDatum(regel.specific_date ?? ""),
      zeit: regel.is_closed ? "geschlossen" : "Sonderzeiten",
      geschlossen: regel.is_closed,
      hinweis: regel.note,
    }));

  return { wochentage, ausnahmen };
}

/**
 * Monatsraster für die Kalenderansicht, Montag zuerst.
 * Liefert "YYYY-MM-DD" für echte Tage und null für Leerzellen (immer 6 Wochen,
 * damit die Ansicht beim Blättern nicht springt).
 */
export function monatsRaster(jahr: number, monat: number): (string | null)[] {
  const ersterTag = `${jahr}-${String(monat).padStart(2, "0")}-01`;
  const leerzellen = wochentagIso(ersterTag) - 1;
  const tageImMonat = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();

  const zellen: (string | null)[] = [];
  for (let i = 0; i < leerzellen; i += 1) zellen.push(null);
  for (let tag = 1; tag <= tageImMonat; tag += 1) {
    zellen.push(`${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`);
  }
  while (zellen.length < 42) zellen.push(null);
  return zellen.slice(0, 42);
}
