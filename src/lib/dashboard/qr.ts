/**
 * QR-Code-Erzeugung nach ISO/IEC 18004 — selbst geschrieben, ohne Fremdbibliothek.
 *
 * Warum selbst geschrieben? Der QR-Code zeigt auf den öffentlichen Kundenlink
 * `/w/<slug>`. Er wird im Browser erzeugt und als Datei heruntergeladen — dafür
 * braucht es keinen externen Dienst und keine zusätzliche Abhängigkeit im
 * Projekt (Datenschutz: der Link verlässt nie den Rechner der Werkstatt).
 *
 * Umfang: Byte-Modus (der Link besteht aus ASCII-Zeichen), Versionen 1–10,
 * Fehlerkorrekturstufen L/M/Q/H, Reed-Solomon-Fehlerkorrektur, alle acht
 * Maskenmuster mit Standard-Bewertung. Das genügt für Links bis ca. 270 Zeichen
 * — deutlich mehr, als ein Werkstattlink je erreicht.
 *
 * Reine Funktionen (keine Datenbank, kein DOM) — tests/dashboard/qr.test.ts.
 */

export type QrStufe = "L" | "M" | "Q" | "H";

export type QrMatrix = {
  /** Kantenlänge in Modulen (ohne Ruhezone). */
  groesse: number;
  /** matrix[zeile][spalte] — true = dunkles Modul. */
  module: boolean[][];
  version: number;
  stufe: QrStufe;
  maske: number;
};

export type QrOptionen = {
  /** Fehlerkorrekturstufe, Standard "M". */
  stufe?: QrStufe;
  /** Erzwingt eine Version (1–10) statt der kleinsten passenden. */
  version?: number;
  /** Erzwingt eine Maske (0–7); ohne Angabe wird die beste gewählt. */
  maske?: number;
};

/* -------------------------------------------------------------------------- */
/* Tabellen nach ISO/IEC 18004                                                */
/* -------------------------------------------------------------------------- */

/** Gesamtzahl der Codewörter je Version. */
const CODEWOERTER: Record<number, number> = {
  1: 26,
  2: 44,
  3: 70,
  4: 100,
  5: 134,
  6: 172,
  7: 196,
  8: 242,
  9: 292,
  10: 346,
};

/**
 * Blockstruktur je Version und Stufe.
 * eccProBlock = Fehlerkorrektur-Codewörter pro Block,
 * gruppen = [Anzahl Blöcke, Datencodewörter je Block] — Gruppe 2 folgt auf 1.
 */
const BLOCKSTRUKTUR: Record<number, Record<QrStufe, { eccProBlock: number; gruppen: [number, number][] }>> = {
  1: {
    L: { eccProBlock: 7, gruppen: [[1, 19]] },
    M: { eccProBlock: 10, gruppen: [[1, 16]] },
    Q: { eccProBlock: 13, gruppen: [[1, 13]] },
    H: { eccProBlock: 17, gruppen: [[1, 9]] },
  },
  2: {
    L: { eccProBlock: 10, gruppen: [[1, 34]] },
    M: { eccProBlock: 16, gruppen: [[1, 28]] },
    Q: { eccProBlock: 22, gruppen: [[1, 22]] },
    H: { eccProBlock: 28, gruppen: [[1, 16]] },
  },
  3: {
    L: { eccProBlock: 15, gruppen: [[1, 55]] },
    M: { eccProBlock: 26, gruppen: [[1, 44]] },
    Q: { eccProBlock: 18, gruppen: [[2, 17]] },
    H: { eccProBlock: 22, gruppen: [[2, 13]] },
  },
  4: {
    L: { eccProBlock: 20, gruppen: [[1, 80]] },
    M: { eccProBlock: 18, gruppen: [[2, 32]] },
    Q: { eccProBlock: 26, gruppen: [[2, 24]] },
    H: { eccProBlock: 16, gruppen: [[4, 9]] },
  },
  5: {
    L: { eccProBlock: 26, gruppen: [[1, 108]] },
    M: { eccProBlock: 24, gruppen: [[2, 43]] },
    Q: { eccProBlock: 18, gruppen: [[2, 15], [2, 16]] },
    H: { eccProBlock: 22, gruppen: [[2, 11], [2, 12]] },
  },
  6: {
    L: { eccProBlock: 18, gruppen: [[2, 68]] },
    M: { eccProBlock: 16, gruppen: [[4, 27]] },
    Q: { eccProBlock: 24, gruppen: [[4, 19]] },
    H: { eccProBlock: 28, gruppen: [[4, 15]] },
  },
  7: {
    L: { eccProBlock: 20, gruppen: [[2, 78]] },
    M: { eccProBlock: 18, gruppen: [[4, 31]] },
    Q: { eccProBlock: 18, gruppen: [[2, 14], [4, 15]] },
    H: { eccProBlock: 26, gruppen: [[4, 13], [1, 14]] },
  },
  8: {
    L: { eccProBlock: 24, gruppen: [[2, 97]] },
    M: { eccProBlock: 22, gruppen: [[2, 38], [2, 39]] },
    Q: { eccProBlock: 22, gruppen: [[4, 18], [2, 19]] },
    H: { eccProBlock: 26, gruppen: [[4, 14], [2, 15]] },
  },
  9: {
    L: { eccProBlock: 30, gruppen: [[2, 116]] },
    M: { eccProBlock: 22, gruppen: [[3, 36], [2, 37]] },
    Q: { eccProBlock: 20, gruppen: [[4, 16], [4, 17]] },
    H: { eccProBlock: 24, gruppen: [[4, 12], [4, 13]] },
  },
  10: {
    L: { eccProBlock: 18, gruppen: [[2, 68], [2, 69]] },
    M: { eccProBlock: 26, gruppen: [[4, 43], [1, 44]] },
    Q: { eccProBlock: 24, gruppen: [[6, 19], [2, 20]] },
    H: { eccProBlock: 28, gruppen: [[6, 15], [2, 16]] },
  },
};

/** Positionen der Ausrichtungsmuster (Mittelpunkt-Koordinaten). */
const AUSRICHTUNG: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

/** Bits der Fehlerkorrekturstufe in der Formatinformation. */
const STUFEN_BITS: Record<QrStufe, number> = { L: 1, M: 0, Q: 3, H: 2 };

export const QR_VERSIONEN_MAX = 10;

/* -------------------------------------------------------------------------- */
/* Hilfsfunktionen                                                            */
/* -------------------------------------------------------------------------- */

/** Datencodewörter einer Version/Stufe. */
function datenCodewoerter(version: number, stufe: QrStufe): number {
  const struktur = BLOCKSTRUKTUR[version][stufe];
  return struktur.gruppen.reduce(
    (summe, [anzahl, cw]) => summe + anzahl * cw,
    0,
  );
}

/** Bit-Modus-Kennung für Byte-Modus. */
const MODUS_BYTE = 0b0100;

/** Anzahl der Zeichen-Bits im Byte-Modus (Version 10–26 nutzen 16 Bit). */
function zeichenBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

function textAlsBytes(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

/** Kleinste Version, in die der Text passt (Byte-Modus, gewählte Stufe). */
function kleinsteVersion(anzahlBytes: number, stufe: QrStufe): number {
  for (let version = 1; version <= QR_VERSIONEN_MAX; version += 1) {
    const nutzbar = datenCodewoerter(version, stufe) * 8;
    const benoetigt = 4 + zeichenBits(version) + anzahlBytes * 8;
    if (benoetigt <= nutzbar) return version;
  }
  throw new Error(
    `Der Text ist zu lang für einen QR-Code (${anzahlBytes} Zeichen, Stufe ${stufe}).`,
  );
}

/* -------------------------------------------------------------------------- */
/* Reed-Solomon über GF(256)                                                  */
/* -------------------------------------------------------------------------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let wert = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = wert;
    LOG[wert] = i;
    wert <<= 1;
    if (wert & 0x100) wert ^= 0x11d; // Generatorpolynom x^8+x^4+x^3+x^2+1
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

function gfMultiplizieren(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Generatorpolynom für `grad` Fehlerkorrektur-Codewörter. */
function generatorPolynom(grad: number): number[] {
  let polynom = [1];
  for (let i = 0; i < grad; i += 1) {
    const naechstes = new Array<number>(polynom.length + 1).fill(0);
    for (let j = 0; j < polynom.length; j += 1) {
      naechstes[j] ^= gfMultiplizieren(polynom[j], EXP[i]);
      naechstes[j + 1] ^= polynom[j];
    }
    polynom = naechstes;
  }
  return polynom;
}

/** Reed-Solomon-Rest (Fehlerkorrektur-Codewörter) für einen Block. */
function fehlerkorrektur(daten: readonly number[], grad: number): number[] {
  const generator = generatorPolynom(grad);
  const rest = [...daten, ...new Array<number>(grad).fill(0)];
  for (let i = 0; i < daten.length; i += 1) {
    const faktor = rest[i];
    if (faktor === 0) continue;
    for (let j = 0; j < generator.length; j += 1) {
      rest[i + j] ^= gfMultiplizieren(generator[j], faktor);
    }
  }
  return rest.slice(daten.length);
}

/* -------------------------------------------------------------------------- */
/* Codierung                                                                  */
/* -------------------------------------------------------------------------- */

function datenBits(bytes: readonly number[], version: number, stufe: QrStufe): number[] {
  const gesamt = datenCodewoerter(version, stufe);
  const bits: number[] = [];
  const schiebe = (wert: number, laenge: number) => {
    for (let i = laenge - 1; i >= 0; i -= 1) bits.push((wert >> i) & 1);
  };
  schiebe(MODUS_BYTE, 4);
  schiebe(bytes.length, zeichenBits(version));
  for (const byte of bytes) schiebe(byte, 8);
  // Abschluss: Terminator, Auffüllen auf Bytegrenze, Füllbytes 0xEC/0x11.
  const nutzbar = gesamt * 8;
  schiebe(0, Math.min(4, Math.max(0, nutzbar - bits.length)));
  while (bits.length % 8 !== 0) bits.push(0);
  let fuellwert = 0xec;
  while (bits.length < nutzbar) {
    schiebe(fuellwert, 8);
    fuellwert = fuellwert === 0xec ? 0x11 : 0xec;
  }
  return bits;
}

/** Datencodewörter auf Blöcke aufteilen, Fehlerkorrektur anhängen, verschachteln. */
function codewoerterMitKorrektur(
  bits: readonly number[],
  version: number,
  stufe: QrStufe,
): number[] {
  const struktur = BLOCKSTRUKTUR[version][stufe];
  const alleDaten: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (bits[i + j] ?? 0);
    alleDaten.push(byte);
  }
  const bloecke: { daten: number[]; korrektur: number[] }[] = [];
  let position = 0;
  for (const [anzahl, laenge] of struktur.gruppen) {
    for (let i = 0; i < anzahl; i += 1) {
      const blockDaten = alleDaten.slice(position, position + laenge);
      position += laenge;
      bloecke.push({
        daten: blockDaten,
        korrektur: fehlerkorrektur(blockDaten, struktur.eccProBlock),
      });
    }
  }
  const ergebnis: number[] = [];
  const maxDaten = Math.max(...bloecke.map((block) => block.daten.length));
  for (let i = 0; i < maxDaten; i += 1) {
    for (const block of bloecke) {
      if (i < block.daten.length) ergebnis.push(block.daten[i]);
    }
  }
  for (let i = 0; i < struktur.eccProBlock; i += 1) {
    for (const block of bloecke) ergebnis.push(block.korrektur[i]);
  }
  return ergebnis;
}

/* -------------------------------------------------------------------------- */
/* Matrix                                                                     */
/* -------------------------------------------------------------------------- */

function leereMatrix(groesse: number, wert: boolean): boolean[][] {
  return Array.from({ length: groesse }, () => new Array<boolean>(groesse).fill(wert));
}

function zeichneSucher(
  module: boolean[][],
  belegt: boolean[][],
  groesse: number,
  mitteZeile: number,
  mitteSpalte: number,
): void {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const zeile = mitteZeile + dy;
      const spalte = mitteSpalte + dx;
      if (zeile < 0 || zeile >= groesse || spalte < 0 || spalte >= groesse) continue;
      const abstand = Math.max(Math.abs(dx), Math.abs(dy));
      module[zeile][spalte] = abstand !== 2 && abstand !== 4;
      belegt[zeile][spalte] = true;
    }
  }
}

function zeichneAusrichtung(
  module: boolean[][],
  belegt: boolean[][],
  mitteZeile: number,
  mitteSpalte: number,
): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const abstand = Math.max(Math.abs(dx), Math.abs(dy));
      module[mitteZeile + dy][mitteSpalte + dx] = abstand !== 1;
      belegt[mitteZeile + dy][mitteSpalte + dx] = true;
    }
  }
}

/** BCH-Rest für die Formatinformation (15,5). */
function formatBits(stufe: QrStufe, maske: number): number {
  const daten = (STUFEN_BITS[stufe] << 3) | maske;
  let rest = daten << 10;
  for (let i = 14; i >= 10; i -= 1) {
    if ((rest >> i) & 1) rest ^= 0x537 << (i - 10);
  }
  return ((daten << 10) | (rest & 0x3ff)) ^ 0x5412;
}

/** BCH-Rest für die Versionsinformation (18,6), nur ab Version 7. */
function versionsBits(version: number): number {
  let rest = version << 12;
  for (let i = 17; i >= 12; i -= 1) {
    if ((rest >> i) & 1) rest ^= 0x1f25 << (i - 12);
  }
  return (version << 12) | (rest & 0xfff);
}

function maskeTrifft(maske: number, zeile: number, spalte: number): boolean {
  switch (maske) {
    case 0:
      return (zeile + spalte) % 2 === 0;
    case 1:
      return zeile % 2 === 0;
    case 2:
      return spalte % 3 === 0;
    case 3:
      return (zeile + spalte) % 3 === 0;
    case 4:
      return (Math.floor(zeile / 2) + Math.floor(spalte / 3)) % 2 === 0;
    case 5:
      return ((zeile * spalte) % 2) + ((zeile * spalte) % 3) === 0;
    case 6:
      return (((zeile * spalte) % 2) + ((zeile * spalte) % 3)) % 2 === 0;
    default:
      return (((zeile + spalte) % 2) + ((zeile * spalte) % 3)) % 2 === 0;
  }
}

/** Gültige Funktionsmuster setzen und die belegten Felder zurückgeben. */
function funktionsmuster(version: number): { module: boolean[][]; belegt: boolean[][] } {
  const groesse = version * 4 + 17;
  const module = leereMatrix(groesse, false);
  const belegt = leereMatrix(groesse, false);

  // Suchermuster mit Trennlinien in drei Ecken.
  zeichneSucher(module, belegt, groesse, 3, 3);
  zeichneSucher(module, belegt, groesse, 3, groesse - 4);
  zeichneSucher(module, belegt, groesse, groesse - 4, 3);

  // Taktmuster (Zeile 6 und Spalte 6).
  for (let i = 8; i < groesse - 8; i += 1) {
    module[6][i] = i % 2 === 0;
    module[i][6] = i % 2 === 0;
    belegt[6][i] = true;
    belegt[i][6] = true;
  }

  // Ausrichtungsmuster (nicht über den Suchermustern).
  const positionen = AUSRICHTUNG[version];
  for (const zeile of positionen) {
    for (const spalte of positionen) {
      const ueberSucher =
        (zeile === 6 && spalte === 6) ||
        (zeile === 6 && spalte === groesse - 7) ||
        (zeile === groesse - 7 && spalte === 6);
      if (ueberSucher) continue;
      zeichneAusrichtung(module, belegt, zeile, spalte);
    }
  }

  // Reservierte Bereiche für Format- und Versionsinformation.
  for (let i = 0; i < 9; i += 1) {
    if (i !== 6) {
      belegt[8][i] = true;
      belegt[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i += 1) {
    belegt[8][groesse - 1 - i] = true;
    belegt[groesse - 1 - i][8] = true;
  }
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const a = groesse - 11 + (i % 3);
      const b = Math.floor(i / 3);
      belegt[b][a] = true;
      belegt[a][b] = true;
    }
  }
  return { module, belegt };
}

function setzeFormat(
  module: boolean[][],
  groesse: number,
  stufe: QrStufe,
  maske: number,
): void {
  const bits = formatBits(stufe, maske);
  const bit = (index: number) => ((bits >> index) & 1) === 1;
  // Erste Kopie: Bit 0–5 in Zeile 8 links, dann Bit 6/7/8 um die Ecke, Bit 9–14
  // in Spalte 8 nach oben.
  for (let i = 0; i <= 5; i += 1) module[8][i] = bit(i);
  module[8][7] = bit(6);
  module[8][8] = bit(7);
  module[7][8] = bit(8);
  for (let i = 9; i < 15; i += 1) module[14 - i][8] = bit(i);
  // Zweite Kopie: Bit 0–7 unter dem Suchermuster rechts, Bit 8–14 oben rechts.
  for (let i = 0; i < 8; i += 1) module[groesse - 1 - i][8] = bit(i);
  for (let i = 8; i < 15; i += 1) module[8][groesse - 15 + i] = bit(i);
  module[groesse - 8][8] = true; // festes dunkles Modul
}

function setzeVersion(module: boolean[][], groesse: number, version: number): void {
  if (version < 7) return;
  const bits = versionsBits(version);
  for (let i = 0; i < 18; i += 1) {
    const wert = ((bits >> i) & 1) === 1;
    const a = groesse - 11 + (i % 3);
    const b = Math.floor(i / 3);
    module[b][a] = wert;
    module[a][b] = wert;
  }
}

/** Nutzdaten (inkl. Fehlerkorrektur) in Zickzack-Spalten einsetzen. */
function setzeDaten(
  module: boolean[][],
  belegt: boolean[][],
  groesse: number,
  codewoerter: readonly number[],
  maske: number,
): void {
  const bits: number[] = [];
  for (const codewort of codewoerter) {
    for (let i = 7; i >= 0; i -= 1) bits.push((codewort >> i) & 1);
  }
  let index = 0;
  let aufwaerts = true;
  for (let spalte = groesse - 1; spalte > 0; spalte -= 2) {
    if (spalte === 6) spalte = 5; // Takmuster-Spalte überspringen
    for (let schritt = 0; schritt < groesse; schritt += 1) {
      const zeile = aufwaerts ? groesse - 1 - schritt : schritt;
      for (const aktuelleSpalte of [spalte, spalte - 1]) {
        if (belegt[zeile][aktuelleSpalte]) continue;
        const dunkel = (bits[index] ?? 0) === 1;
        index += 1;
        module[zeile][aktuelleSpalte] = dunkel !== maskeTrifft(maske, zeile, aktuelleSpalte);
      }
    }
    aufwaerts = !aufwaerts;
  }
}

/* -------------------------------------------------------------------------- */
/* Maskenbewertung (Standard-Strafpunkte)                                     */
/* -------------------------------------------------------------------------- */

function strafpunkte(module: readonly boolean[][], groesse: number): number {
  let punkte = 0;
  const gleich = (a: boolean, b: boolean) => a === b;
  const musterA = [true, false, true, true, true, false, true, false, false, false, false];
  const musterB = [false, false, false, false, true, false, true, true, true, false, true];

  const zeileOderSpalte = (
    lesen: (i: number, j: number) => boolean,
  ): number => {
    let summe = 0;
    for (let i = 0; i < groesse; i += 1) {
      // Regel 1: Reihen gleicher Farbe (ab 5 Modulen).
      let lauf = 1;
      for (let j = 1; j < groesse; j += 1) {
        if (gleich(lesen(i, j), lesen(i, j - 1))) lauf += 1;
        else {
          if (lauf >= 5) summe += 3 + (lauf - 5);
          lauf = 1;
        }
      }
      if (lauf >= 5) summe += 3 + (lauf - 5);
      // Regel 3: Suchmuster-ähnliche Folgen.
      for (let j = 0; j + 11 <= groesse; j += 1) {
        let passtA = true;
        let passtB = true;
        for (let k = 0; k < 11; k += 1) {
          if (lesen(i, j + k) !== musterA[k]) passtA = false;
          if (lesen(i, j + k) !== musterB[k]) passtB = false;
        }
        if (passtA) summe += 40;
        if (passtB) summe += 40;
      }
    }
    return summe;
  };

  punkte += zeileOderSpalte((zeile, spalte) => module[zeile][spalte]);
  punkte += zeileOderSpalte((spalte, zeile) => module[zeile][spalte]);

  // Regel 2: gleichfarbige 2x2-Blöcke.
  for (let zeile = 0; zeile < groesse - 1; zeile += 1) {
    for (let spalte = 0; spalte < groesse - 1; spalte += 1) {
      const farbe = module[zeile][spalte];
      if (
        farbe === module[zeile][spalte + 1] &&
        farbe === module[zeile + 1][spalte] &&
        farbe === module[zeile + 1][spalte + 1]
      ) {
        punkte += 3;
      }
    }
  }

  // Regel 4: Abweichung vom ausgewogenen Schwarzanteil.
  let dunkel = 0;
  for (const zeile of module) for (const feld of zeile) if (feld) dunkel += 1;
  const anteil = (dunkel * 100) / (groesse * groesse);
  punkte += Math.floor(Math.abs(anteil - 50) / 5) * 10;

  return punkte;
}

/* -------------------------------------------------------------------------- */
/* Öffentliche Schnittstelle                                                  */
/* -------------------------------------------------------------------------- */

function normalisiereStufe(wert: unknown): QrStufe {
  return wert === "L" || wert === "Q" || wert === "H" ? wert : "M";
}

/**
 * Erzeugt die QR-Matrix für einen Text.
 *
 * Gleicher Text + gleiche Optionen ⇒ identische Matrix (keine Zufallszahlen),
 * damit Server und Browser dasselbe Bild zeigen.
 */
export function erzeugeQrMatrix(text: string, optionen: QrOptionen = {}): QrMatrix {
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("Für den QR-Code wird ein nicht leerer Text benötigt.");
  }
  const stufe = normalisiereStufe(optionen.stufe);
  const bytes = textAlsBytes(text);

  const version =
    optionen.version === undefined
      ? kleinsteVersion(bytes.length, stufe)
      : pruefeVersion(optionen.version, bytes.length, stufe);
  const groesse = version * 4 + 17;

  const bits = datenBits(bytes, version, stufe);
  const codewoerter = codewoerterMitKorrektur(bits, version, stufe);
  const { module: grundgeruest, belegt } = funktionsmuster(version);

  const erzwungeneMaske =
    optionen.maske === undefined ? null : pruefeMaske(optionen.maske);

  let beste: boolean[][] | null = null;
  let bestesErgebnis = Number.POSITIVE_INFINITY;
  let besteMaske = 0;

  const kandidaten =
    erzwungeneMaske === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [erzwungeneMaske];

  for (const maske of kandidaten) {
    const module = grundgeruest.map((zeile) => [...zeile]);
    setzeDaten(module, belegt, groesse, codewoerter, maske);
    setzeVersion(module, groesse, version);
    setzeFormat(module, groesse, stufe, maske);
    const punkte = strafpunkte(module, groesse);
    if (punkte < bestesErgebnis) {
      bestesErgebnis = punkte;
      beste = module;
      besteMaske = maske;
    }
  }

  const module = (beste ?? grundgeruest).map((zeile) => [...zeile]);
  setzeVersion(module, groesse, version);
  setzeFormat(module, groesse, stufe, besteMaske);

  return { groesse, module, version, stufe, maske: besteMaske };
}

function pruefeVersion(version: number, anzahlBytes: number, stufe: QrStufe): number {
  if (!Number.isInteger(version) || version < 1 || version > QR_VERSIONEN_MAX) {
    throw new Error(`Die QR-Version muss zwischen 1 und ${QR_VERSIONEN_MAX} liegen.`);
  }
  if (4 + zeichenBits(version) + anzahlBytes * 8 > datenCodewoerter(version, stufe) * 8) {
    throw new Error(
      `Der Text passt nicht in QR-Version ${version} bei Stufe ${stufe}.`,
    );
  }
  return version;
}

function pruefeMaske(maske: number): number {
  if (!Number.isInteger(maske) || maske < 0 || maske > 7) {
    throw new Error("Die Maske muss zwischen 0 und 7 liegen.");
  }
  return maske;
}

export type SvgOptionen = {
  stufe?: QrStufe;
  /** Ruhezone in Modulen (Standard 4, wie in der Norm gefordert). */
  rand?: number;
  /** Kantenlänge eines Moduls in SVG-Einheiten (Standard 8). */
  modulGroesse?: number;
  /** Farbe der dunklen Module (Standard Schwarz). */
  farbe?: string;
  /** Hintergrundfarbe (Standard Weiß — wichtig für Scanner). */
  hintergrund?: string;
  /** Beschreibung für Screenreader. */
  titel?: string;
};

/**
 * QR-Code als SVG-Quelltext (druckfähig, beliebig skalierbar).
 * Nur dunkle Module werden als ein Pfad gezeichnet — kompakt und scharf.
 */
export function qrAlsSvg(text: string, optionen: SvgOptionen = {}): string {
  const matrix =
    optionen.stufe === undefined
      ? erzeugeQrMatrix(text)
      : erzeugeQrMatrix(text, { stufe: optionen.stufe });
  const rand = ruhezone(optionen.rand);
  const modul = modulGroesse(optionen.modulGroesse);
  const kante = (matrix.groesse + rand * 2) * modul;
  const farbe = optionen.farbe ?? "#0f172a";
  const hintergrund = optionen.hintergrund ?? "#ffffff";

  let pfad = "";
  for (let zeile = 0; zeile < matrix.groesse; zeile += 1) {
    let spalte = 0;
    while (spalte < matrix.groesse) {
      if (!matrix.module[zeile][spalte]) {
        spalte += 1;
        continue;
      }
      let laenge = 1;
      while (
        spalte + laenge < matrix.groesse &&
        matrix.module[zeile][spalte + laenge]
      ) {
        laenge += 1;
      }
      pfad += `M${(spalte + rand) * modul} ${(zeile + rand) * modul}h${laenge * modul}v${modul}h-${laenge * modul}z`;
      spalte += laenge;
    }
  }

  const titel = optionen.titel ?? "QR-Code";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${kante}" height="${kante}" viewBox="0 0 ${kante} ${kante}" role="img" shape-rendering="crispEdges">`,
    `<title>${entkomme(titel)}</title>`,
    `<rect width="${kante}" height="${kante}" fill="${hintergrund}"/>`,
    `<path fill="${farbe}" d="${pfad}"/>`,
    `</svg>`,
  ].join("");
}

function entkomme(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* -------------------------------------------------------------------------- */
/* PNG-Ausgabe — ebenfalls ohne Fremdbibliothek                               */
/* -------------------------------------------------------------------------- */

/**
 * PNG-Darstellung des QR-Codes (1 Bit Graustufen, schwarz auf weiß).
 *
 * Warum ein eigener PNG-Schreiber? Der Download darf auch im Browser ohne
 * Canvas und ohne zlib-Abhängigkeit entstehen. Ein PNG braucht nur drei
 * Chunks (IHDR, IDAT, IEND), CRC-32 über jeden Chunk, Adler-32 als Prüfsumme
 * und einen Deflate-Strom — hier mit unkomprimierten Blöcken (BTYPE 00), was
 * jeder Betrachter und jeder Scanner liest und für ein 500×500-Bild völlig
 * ausreicht.
 *
 * Graustufen mit 1 Bit Tiefe ist das robusteste Format für Scanner: keine
 * Farbprofile, keine Alphakanäle, harte Kanten.
 */
export function qrAlsPng(text: string, optionen: SvgOptionen = {}): Uint8Array {
  const matrix =
    optionen.stufe === undefined
      ? erzeugeQrMatrix(text)
      : erzeugeQrMatrix(text, { stufe: optionen.stufe });
  const rand = ruhezone(optionen.rand);
  const modul = modulGroesse(optionen.modulGroesse);
  const seiten = matrix.groesse + rand * 2;
  const kante = seiten * modul;
  const zeilenBytes = Math.ceil(kante / 8);

  // Rohbild: je Zeile ein Filterbyte (0 = None) und die Pixelbits, MSB zuerst.
  // 1 = weiß, 0 = schwarz (so definiert es das Graustufenformat).
  const roh = new Uint8Array((zeilenBytes + 1) * kante);
  roh.fill(0xff);
  for (let zeile = 0; zeile < kante; zeile += 1) roh[zeile * (zeilenBytes + 1)] = 0;

  const schwärze = (px: number, py: number) => {
    roh[py * (zeilenBytes + 1) + 1 + (px >> 3)] &= ~(0x80 >> (px & 7)) & 0xff;
  };
  for (let zeile = 0; zeile < matrix.groesse; zeile += 1) {
    for (let spalte = 0; spalte < matrix.groesse; spalte += 1) {
      if (!matrix.module[zeile][spalte]) continue;
      for (let dy = 0; dy < modul; dy += 1) {
        const py = (zeile + rand) * modul + dy;
        for (let dx = 0; dx < modul; dx += 1) {
          schwärze((spalte + rand) * modul + dx, py);
        }
      }
    }
  }

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, kante);
  ihdrView.setUint32(4, kante);
  ihdr[8] = 1; // Bittiefe
  ihdr[9] = 0; // Farbtyp 0 = Graustufen
  ihdr[10] = 0; // Kompression (Deflate, wie in der Norm festgelegt)
  ihdr[11] = 0; // Filterverfahren
  ihdr[12] = 0; // kein Interlacing

  const teile = [
    SIGNATUR,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlibGespeichert(roh)),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const laenge = teile.reduce((summe, teil) => summe + teil.length, 0);
  const ergebnis = new Uint8Array(laenge);
  let position = 0;
  for (const teil of teile) {
    ergebnis.set(teil, position);
    position += teil.length;
  }
  return ergebnis;
}

const SIGNATUR = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABELLE = (() => {
  const tabelle = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let wert = n;
    for (let k = 0; k < 8; k += 1) {
      wert = wert & 1 ? 0xedb88320 ^ (wert >>> 1) : wert >>> 1;
    }
    tabelle[n] = wert >>> 0;
  }
  return tabelle;
})();

/** CRC-32 (wie von PNG für jeden Chunk verlangt). */
function crc32(daten: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < daten.length; i += 1) {
    crc = CRC_TABELLE[(crc ^ daten[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Adler-32 — Prüfsumme des zlib-Stroms. */
function adler32(daten: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < daten.length; i += 1) {
    a = (a + daten[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Ein PNG-Chunk: Länge, Typ, Nutzdaten, CRC-32 (alles Big-Endian). */
function pngChunk(typ: string, daten: Uint8Array): Uint8Array {
  const typBytes = new TextEncoder().encode(typ);
  const inhalt = new Uint8Array(typBytes.length + daten.length);
  inhalt.set(typBytes);
  inhalt.set(daten, typBytes.length);

  const kopf = new Uint8Array(4);
  new DataView(kopf.buffer).setUint32(0, daten.length);

  const pruefsumme = new Uint8Array(4);
  new DataView(pruefsumme.buffer).setUint32(0, crc32(inhalt));

  const chunk = new Uint8Array(4 + inhalt.length + 4);
  chunk.set(kopf, 0);
  chunk.set(inhalt, 4);
  chunk.set(pruefsumme, 4 + inhalt.length);
  return chunk;
}

/** zlib-Strom mit unkomprimierten Deflate-Blöcken (maximal 65535 Byte je Block). */
function zlibGespeichert(daten: Uint8Array): Uint8Array {
  const teile: number[] = [0x78, 0x01]; // CMF/FLG: Deflate, keine Voreinstellung
  let position = 0;
  do {
    const laenge = Math.min(65535, daten.length - position);
    const letzterBlock = position + laenge >= daten.length ? 1 : 0;
    teile.push(
      letzterBlock,
      laenge & 0xff,
      (laenge >> 8) & 0xff,
      ~laenge & 0xff,
      (~laenge >> 8) & 0xff,
    );
    for (let i = 0; i < laenge; i += 1) teile.push(daten[position + i]);
    position += laenge;
  } while (position < daten.length);

  const pruefsumme = adler32(daten);
  teile.push(
    (pruefsumme >>> 24) & 0xff,
    (pruefsumme >>> 16) & 0xff,
    (pruefsumme >>> 8) & 0xff,
    pruefsumme & 0xff,
  );
  return new Uint8Array(teile);
}

/* -------------------------------------------------------------------------- */
/* Optionen                                                                   */
/* -------------------------------------------------------------------------- */

/** Ruhezone in Modulen (mindestens vier, wie die Norm fordert). */
function ruhezone(wert: number | undefined): number {
  return Number.isFinite(wert) && (wert as number) >= 4 ? Math.floor(wert as number) : 4;
}

/** Kantenlänge eines Moduls in Bildpunkten. */
function modulGroesse(wert: number | undefined): number {
  return Number.isFinite(wert) ? Math.max(1, Math.floor(wert as number)) : 8;
}

/** Dateiname für den Download, z. B. "qr-code-kfz-werkstatt-berger.svg". */
export function qrDateiname(werkstattName: string, endung = "svg"): string {
  const bereinigt = (typeof werkstattName === "string" ? werkstattName : "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  const saubereEndung = (typeof endung === "string" ? endung : "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  // Nur kurze, reine Buchstaben-/Zahlenendungen übernehmen ("svg", "png") —
  // alles andere (Pfadangaben, Sonderzeichen) fällt auf "svg" zurück.
  const endungFinal = /^[a-z0-9]{1,5}$/.test(saubereEndung) ? saubereEndung : "svg";
  return `qr-code-${bereinigt || "werkstatt"}.${endungFinal}`;
}
