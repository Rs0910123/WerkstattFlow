/**
 * QR-Code-Erzeugung — der Kern kommt aus der Bibliothek "qrcode" (node-qrcode, MIT).
 *
 * Warum eine Fremdbibliothek? Ein erster Versuch, den Encoder selbst zu
 * schreiben (Reed-Solomon, Maskierung, Platzierung), erzeugte Codes, die kein
 * Scanner entschlüsseln konnte — zbar las 0 von 104 Fällen; ein QR-Code auf
 * der Theke, der nicht funktioniert, ist ein Geschäftsrisiko. Genau dieser
 * handgeschriebene Kern ist deshalb entfernt und durch eine etablierte
 * Bibliothek ersetzt.
 *
 * Eingebunden wird nur der reine Kern `qrcode/lib/core/qrcode` (siehe
 * src/types/qrcode-core.d.ts): Er liefert die Modulmatrix direkt, hängt von
 * nichts außer eigenen Modulen ab und läuft unverändert im Browser — die
 * Renderer des Pakets (Canvas/PNG) werden nicht geladen, weil SVG und PNG
 * weiterhin hier geschrieben werden (ohne Canvas, ohne zlib-Abhängigkeit).
 *
 * Umfang der Fassade: Byte-Modus (die Bibliothek würde Ziffern und
 * Großbuchstaben kompakter kodieren — Byte trägt aber Umlaute, Bindestriche
 * und URLs sicher und ist der Modus der Referenzmatrizen), Versionen 1–10,
 * Fehlerkorrekturstufen L/M/Q/H, alle acht Maskenmuster.
 *
 * Reine Funktionen (keine Datenbank, kein DOM) — tests/dashboard/qr.test.ts.
 */

import qrKern from "qrcode/lib/core/qrcode.js";
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
/* -------------------------------------------------------------------------- */
/* Kern: Byte-Modus, Reed-Solomon, Maskierung und Platzierung aus "qrcode"     */
/* -------------------------------------------------------------------------- */

export const QR_VERSIONEN_MAX = 10;

/**
 * Nutzdaten als Byte-Segment — bewusst kein Auto-Modus der Bibliothek.
 * Die Bibliothek wählt sonst für reine Ziffern/Großbuchstaben den
 * alphanumerischen Modus; Byte ist der einzige Modus, der Umlaute und URLs
 * sicher trägt, und der Modus der Referenzmatrizen (tests/dashboard/qr-referenz.json).
 */
function alsByteSegment(text: string): { data: string; mode: string }[] {
  return [{ data: text, mode: "byte" }];
}

/**
 * Eine Modulmatrix über die Bibliothek erzeugen.
 *
 * Wirft, wenn der Text nicht in die (ggf. erzwungene) Version passt — den Fall
 * übersetzt erzeugeQrMatrix() in eine deutsche Meldung.
 */
function matrixAusBibliothek(
  text: string,
  version: number | null,
  stufe: QrStufe,
  maske: number | null,
): QrMatrix {
  const ergebnis = qrKern.create(alsByteSegment(text), {
    version: version ?? undefined,
    errorCorrectionLevel: stufe,
    maskPattern: maske ?? undefined,
  });

  const groesse = ergebnis.modules.size;
  const module: boolean[][] = [];
  for (let zeile = 0; zeile < groesse; zeile += 1) {
    const reihe: boolean[] = [];
    for (let spalte = 0; spalte < groesse; spalte += 1) {
      reihe.push(ergebnis.modules.get(zeile, spalte) === 1);
    }
    module.push(reihe);
  }

  return {
    groesse,
    module,
    version: ergebnis.version,
    stufe,
    maske: ergebnis.maskPattern,
  };
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
 *
 * Ohne erzwungene Version probieren wir 1 bis QR_VERSIONEN_MAX durch und
 * nehmen die kleinste passende — die Kapazitätsgrenzen kommen dabei aus der
 * Bibliothek, nicht aus einer eigenen Tabelle.
 */
export function erzeugeQrMatrix(text: string, optionen: QrOptionen = {}): QrMatrix {
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("Für den QR-Code wird ein nicht leerer Text benötigt.");
  }
  const stufe = normalisiereStufe(optionen.stufe);
  const version =
    optionen.version === undefined ? null : pruefeVersion(optionen.version);
  const maske = optionen.maske === undefined ? null : pruefeMaske(optionen.maske);

  const kandidaten =
    version === null
      ? Array.from({ length: QR_VERSIONEN_MAX }, (_, i) => i + 1)
      : [version];

  for (const kandidat of kandidaten) {
    try {
      return matrixAusBibliothek(text, kandidat, stufe, maske);
    } catch {
      if (version !== null) {
        throw new Error(
          `Der Text passt nicht in QR-Version ${version} bei Stufe ${stufe}.`,
        );
      }
    }
  }

  throw new Error(
    `Der Text ist zu lang für einen QR-Code (Stufe ${stufe}, höchstens Version ${QR_VERSIONEN_MAX}).`,
  );
}

function pruefeVersion(version: number): number {
  if (!Number.isInteger(version) || version < 1 || version > QR_VERSIONEN_MAX) {
    throw new Error(`Die QR-Version muss zwischen 1 und ${QR_VERSIONEN_MAX} liegen.`);
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
  /** Erzwingt eine Version (1–10) statt der kleinsten passenden. */
  version?: number;
  /** Erzwingt eine Maske (0–7); ohne Angabe wird die beste gewählt. */
  maske?: number;
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
  const matrix = erzeugeQrMatrix(text, matrixOptionen(optionen));
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
  const matrix = erzeugeQrMatrix(text, matrixOptionen(optionen));
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

/** Reicht die Matrix-Optionen einer Ausgabe-Option an erzeugeQrMatrix() weiter. */
function matrixOptionen(optionen: SvgOptionen): QrOptionen {
  const ergebnis: QrOptionen = {};
  if (optionen.stufe !== undefined) ergebnis.stufe = optionen.stufe;
  if (optionen.version !== undefined) ergebnis.version = optionen.version;
  if (optionen.maske !== undefined) ergebnis.maske = optionen.maske;
  return ergebnis;
}

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
