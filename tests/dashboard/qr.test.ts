/**
 * Tests des QR-Encoders (src/lib/dashboard/qr.ts).
 *
 * Der Encoder ist handgeschrieben. Ein QR-Code, der sich nicht scannen lässt,
 * wäre schlimmer als keiner — deshalb prüfen diese Tests nicht nur den Aufbau,
 * sondern vergleichen jede Matrix Modul für Modul mit einer fremden
 * Referenzimplementierung (segno, Python) und prüfen die Ausgabedateien so,
 * wie ein Scanner sie liest.
 *
 * Die Referenzmatrizen in tests/dashboard/qr-referenz.json wurden mit
 * scripts/qr-referenz-erzeugen.py erzeugt (Byte-Modus, boost_error=False,
 * ohne Micro-QR) und decken die Versionen 1/2/5/10, alle vier
 * Fehlerkorrekturstufen L/M/Q/H, alle acht Masken sowie Kapazitätsgrenzen ab.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { crc32 as zlibCrc32, inflateSync } from "node:zlib";
import {
  QR_VERSIONEN_MAX,
  erzeugeQrMatrix,
  qrAlsPng,
  qrAlsSvg,
  qrDateiname,
  type QrMatrix,
  type QrStufe,
} from "../../src/lib/dashboard/qr.ts";

type ReferenzFall = {
  gruppe: string;
  name: string;
  text: string;
  version: number;
  stufe: QrStufe;
  maske: number | null;
  referenzMaske: number;
  zeilen: string[];
};

type ReferenzAutomatisch = {
  name: string;
  text: string;
  version: number;
  stufe: QrStufe;
  referenzMaske: number;
};

const referenz: {
  werkzeug: string;
  faelle: ReferenzFall[];
  automatisch: ReferenzAutomatisch[];
} = JSON.parse(
  readFileSync(new URL("./qr-referenz.json", import.meta.url), "utf8"),
);

const STUFEN: QrStufe[] = ["L", "M", "Q", "H"];
const DEMO_LINK = "/w/kfz-werkstatt-berger";

/** Matrix als Zeilen aus "0"/"1" — vergleichbar mit der Referenzdatei. */
function alsZeilen(matrix: QrMatrix): string[] {
  return matrix.module.map((zeile) =>
    zeile.map((feld) => (feld ? "1" : "0")).join(""),
  );
}

/** Erste abweichende Module zweier Zeilenlisten (max. 5 für die Meldung). */
function abweichendeModule(erwartet: string[], ist: string[]): string[] {
  const abweichungen: string[] = [];
  for (let zeile = 0; zeile < Math.max(erwartet.length, ist.length); zeile += 1) {
    const a = erwartet[zeile] ?? "";
    const b = ist[zeile] ?? "";
    if (a === b) continue;
    for (let spalte = 0; spalte < Math.max(a.length, b.length); spalte += 1) {
      if (a[spalte] !== b[spalte]) {
        abweichungen.push(`(${zeile},${spalte}) erwartet ${a[spalte]} ist ${b[spalte]}`);
        if (abweichungen.length >= 5) return abweichungen;
      }
    }
  }
  return abweichungen;
}

function passtInVersion(text: string, version: number, stufe: QrStufe): boolean {
  try {
    erzeugeQrMatrix(text, { stufe, version });
    return true;
  } catch {
    return false;
  }
}

/** Größte Byte-Anzahl, die in Version/Stufe passt — durch Ausprobieren. */
function kapazitaet(version: number, stufe: QrStufe): number {
  let klein = 0;
  let gross = 2000;
  while (klein < gross) {
    const mitte = Math.ceil((klein + gross) / 2);
    if (passtInVersion("A".repeat(mitte), version, stufe)) klein = mitte;
    else gross = mitte - 1;
  }
  return klein;
}

describe("QR-Encoder: Vergleich mit der Referenzimplementierung", () => {
  it("Referenzdatei deckt Versionen, Stufen, Masken und Grenzen ab", () => {
    assert.ok(referenz.faelle.length >= 100, "zu wenige Referenzfälle");
    assert.match(referenz.werkzeug, /segno/);
    for (const version of [1, 2, 5, 10]) {
      for (const stufe of STUFEN) {
        assert.ok(
          referenz.faelle.some((fall) => fall.version === version && fall.stufe === stufe),
          `Kein Referenzfall für Version ${version}, Stufe ${stufe}`,
        );
      }
    }
    for (const maske of [0, 1, 2, 3, 4, 5, 6, 7]) {
      assert.ok(
        referenz.faelle.some((fall) => fall.maske === maske),
        `Kein Referenzfall für Maske ${maske}`,
      );
    }
    assert.ok(
      referenz.faelle.some((fall) => fall.gruppe === "kapazitaet"),
      "Keine Kapazitätsgrenze in der Referenz",
    );
    assert.ok(
      referenz.faelle.some((fall) => /[äöüß€–]/.test(fall.text)),
      "Kein Referenzfall mit Umlauten",
    );
  });

  it(`vergleicht ${referenz.faelle.length} Matrizen Modul für Modul`, () => {
    for (const fall of referenz.faelle) {
      const matrix = erzeugeQrMatrix(fall.text, {
        stufe: fall.stufe,
        version: fall.version,
        maske: fall.maske ?? undefined,
      });
      assert.equal(matrix.version, fall.version, `${fall.name}: Version`);
      assert.equal(matrix.stufe, fall.stufe, `${fall.name}: Stufe`);
      assert.equal(matrix.groesse, 4 * fall.version + 17, `${fall.name}: Kantenlänge`);
      assert.equal(matrix.maske, fall.referenzMaske, `${fall.name}: Maske`);
      assert.equal(
        fall.zeilen.length,
        matrix.groesse,
        `${fall.name}: Referenz hat ${fall.zeilen.length} statt ${matrix.groesse} Zeilen`,
      );
      const abweichungen = abweichendeModule(fall.zeilen, alsZeilen(matrix));
      assert.equal(
        abweichungen.length,
        0,
        `${fall.name} (${fall.gruppe}): abweichende Module — ${abweichungen.join("; ")}`,
      );
    }
  });

  it("wählt ohne Vorgabe dieselbe Version wie die Referenz", () => {
    for (const fall of referenz.automatisch) {
      const matrix = erzeugeQrMatrix(fall.text, { stufe: fall.stufe });
      assert.equal(
        matrix.version,
        fall.version,
        `${fall.name}: kleinste Version weicht von der Referenz ab`,
      );
    }
  });

  it("wählt ohne Vorgabe dieselbe Maske wie die Referenz", () => {
    for (const fall of referenz.automatisch) {
      const matrix = erzeugeQrMatrix(fall.text, { stufe: fall.stufe });
      assert.equal(
        matrix.maske,
        fall.referenzMaske,
        `${fall.name}: beste Maske weicht von der Referenz ab`,
      );
    }
  });

  it("hält die Referenz-Kapazitätsgrenzen ein", () => {
    for (const fall of referenz.faelle.filter((f) => f.gruppe === "kapazitaet")) {
      const grenze = Number(/(\d+)B$/.exec(fall.name)?.[1]);
      assert.ok(Number.isInteger(grenze), `${fall.name}: Grenze nicht lesbar`);
      assert.equal(
        fall.text.length,
        grenze,
        `${fall.name}: Referenztext hat nicht die erwartete Länge`,
      );
      assert.equal(
        kapazitaet(fall.version, fall.stufe),
        grenze,
        `${fall.name}: eigene Kapazität weicht von der Referenz ab`,
      );
    }
  });
});

describe("QR-Encoder: Aufbau der Matrix", () => {
  it("hat die Kantenlänge 4·Version+17 und keine Ruhezone in der Matrix", () => {
    for (let version = 1; version <= QR_VERSIONEN_MAX; version += 1) {
      const matrix = erzeugeQrMatrix("A", { version, stufe: "L" });
      assert.equal(matrix.groesse, version * 4 + 17);
      assert.equal(matrix.module.length, matrix.groesse);
      for (const zeile of matrix.module) assert.equal(zeile.length, matrix.groesse);
    }
  });

  it("zeichnet die Suchermuster in drei Ecken mit Trennlinien", () => {
    const matrix = erzeugeQrMatrix(DEMO_LINK);
    const s = matrix.groesse;
    for (const [oz, os] of [[0, 0], [0, s - 7], [s - 7, 0]]) {
      for (let dy = 0; dy < 7; dy += 1) {
        for (let dx = 0; dx < 7; dx += 1) {
          const abstand = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          assert.equal(
            matrix.module[oz + dy][os + dx],
            abstand !== 2,
            `Suchermuster bei (${oz},${os}) Modul (${dy},${dx})`,
          );
        }
      }
    }
    // Trennlinie: direkt unter und rechts vom Suchermuster in der Ecke oben links.
    for (let i = 0; i < 8; i += 1) {
      assert.equal(matrix.module[7][i], false, "Trennlinie unter dem Suchermuster");
      assert.equal(matrix.module[i][7], false, "Trennlinie rechts vom Suchermuster");
    }
  });

  it("hat Taktmuster, dunkles Modul und Versionsinfo ab Version 7", () => {
    for (const version of [1, 6, 7, 10]) {
      const matrix = erzeugeQrMatrix("A", { version, stufe: "L" });
      const s = matrix.groesse;
      for (let i = 8; i < s - 8; i += 1) {
        assert.equal(matrix.module[6][i], i % 2 === 0, `Taktmuster Zeile 6, Version ${version}`);
        assert.equal(matrix.module[i][6], i % 2 === 0, `Taktmuster Spalte 6, Version ${version}`);
      }
      assert.equal(matrix.module[s - 8][8], true, `dunkles Modul, Version ${version}`);
      if (version >= 7) {
        // Versionsinformation ist symmetrisch eingetragen (18 Bit, 6×3-Felder).
        for (let i = 0; i < 18; i += 1) {
          const a = s - 11 + (i % 3);
          const b = Math.floor(i / 3);
          assert.equal(matrix.module[b][a], matrix.module[a][b], "Versionsinfo symmetrisch");
        }
      }
    }
  });

  it("liefert bei gleichem Text dieselbe Matrix (Server und Browser gleich)", () => {
    const a = erzeugeQrMatrix(DEMO_LINK, { stufe: "Q" });
    const b = erzeugeQrMatrix(DEMO_LINK, { stufe: "Q" });
    assert.deepEqual(alsZeilen(a), alsZeilen(b));
  });

  it("erzwingt jede Maske 0–7 und schreibt sie in die Formatinformation", () => {
    // Formatinformation: 15 Bit, obere 5 Bit = Stufenbits (L=01, M=00, Q=11, H=10)
    // gefolgt von der Maskennummer, Rest ist BCH-Prüfung mit Maske 0x5412.
    const stufenBits: Record<QrStufe, number> = { L: 1, M: 0, Q: 3, H: 2 };
    for (const stufe of STUFEN) {
      for (let maske = 0; maske < 8; maske += 1) {
        const matrix = erzeugeQrMatrix(DEMO_LINK, { stufe, version: 2, maske });
        assert.equal(matrix.maske, maske);
        const bits: number[] = [];
        for (let i = 0; i <= 5; i += 1) bits[i] = matrix.module[8][i] ? 1 : 0;
        bits[6] = matrix.module[8][7] ? 1 : 0;
        bits[7] = matrix.module[8][8] ? 1 : 0;
        bits[8] = matrix.module[7][8] ? 1 : 0;
        for (let i = 9; i < 15; i += 1) bits[i] = matrix.module[14 - i][8] ? 1 : 0;
        let wert = 0;
        for (let i = 0; i < 15; i += 1) wert |= bits[i] << i;
        wert ^= 0x5412;
        const daten = wert >> 10;
        assert.equal((daten >> 3) & 0b11, stufenBits[stufe], "Stufenbits");
        assert.equal(daten & 0b111, maske, "Maskennummer in der Formatinformation");
        // BCH-Prüfung mit dem Generatorpolynom 0x537 muss aufgehen.
        let rest = daten << 10;
        for (let i = 14; i >= 10; i -= 1) if ((rest >> i) & 1) rest ^= 0x537 << (i - 10);
        assert.equal(wert & 0x3ff, rest & 0x3ff, "BCH-Prüfsumme");
        // Zweite Kopie der Formatinformation muss dieselben Bits tragen.
        for (let i = 0; i < 8; i += 1) {
          assert.equal(
            matrix.module[matrix.groesse - 1 - i][8],
            bits[i] === 1,
            `zweite Kopie, Bit ${i}`,
          );
        }
        for (let i = 8; i < 15; i += 1) {
          assert.equal(
            matrix.module[8][matrix.groesse - 15 + i],
            bits[i] === 1,
            `zweite Kopie, Bit ${i}`,
          );
        }
      }
    }
  });

  it("unterscheidet sich je Maske (echte Maskierung, keine Platzhalter)", () => {
    const ergebnisse = new Set<string>();
    for (let maske = 0; maske < 8; maske += 1) {
      ergebnisse.add(alsZeilen(erzeugeQrMatrix("https://example.de/w/demo", { stufe: "M", maske })).join(""));
    }
    assert.equal(ergebnisse.size, 8);
  });

  it("kodiert Umlaute und Sonderzeichen als UTF-8", () => {
    const text = "Ölwechsel für Kühe – 30 €";
    const matrix = erzeugeQrMatrix(text, { stufe: "M", version: 3 });
    assert.equal(new TextEncoder().encode(text).length, 32);
    assert.equal(matrix.version, 3);
  });
});

describe("QR-Encoder: Kapazitätsgrenzen", () => {
  it("füllt jede Version und Stufe bis zur Grenze und lehnt ein Zeichen mehr ab", () => {
    for (let version = 1; version <= QR_VERSIONEN_MAX; version += 1) {
      for (const stufe of STUFEN) {
        const grenze = kapazitaet(version, stufe);
        assert.ok(grenze > 0, `Version ${version}/${stufe} nimmt keinen Text auf`);
        assert.equal(passtInVersion("A".repeat(grenze), version, stufe), true);
        assert.equal(passtInVersion("A".repeat(grenze + 1), version, stufe), false);
      }
    }
  });

  it("wächst bei einem Zeichen über der Grenze auf die nächste Version", () => {
    for (let version = 1; version < QR_VERSIONEN_MAX; version += 1) {
      const grenze = kapazitaet(version, "M");
      const matrix = erzeugeQrMatrix("A".repeat(grenze + 1), { stufe: "M" });
      assert.equal(matrix.version, version + 1);
    }
  });

  it("meldet Text, der auch in Version 10 nicht passt, auf Deutsch", () => {
    const zuLang = "x".repeat(kapazitaet(QR_VERSIONEN_MAX, "H") + 1);
    assert.throws(
      () => erzeugeQrMatrix(zuLang),
      /zu lang für einen QR-Code/,
    );
    assert.throws(() => erzeugeQrMatrix(zuLang, { stufe: "H" }), /Stufe H/);
  });

  it("weist ungültige Versionen und Masken ab", () => {
    assert.throws(() => erzeugeQrMatrix("A", { version: 0 }), /zwischen 1 und 10/);
    assert.throws(() => erzeugeQrMatrix("A", { version: 11 }), /zwischen 1 und 10/);
    assert.throws(() => erzeugeQrMatrix("A", { version: 1.5 }), /zwischen 1 und 10/);
    assert.throws(() => erzeugeQrMatrix("A", { maske: 8 }), /Maske muss zwischen 0 und 7/);
    assert.throws(() => erzeugeQrMatrix("A", { maske: -1 }), /Maske muss zwischen 0 und 7/);
  });

  it("verlangt einen nicht leeren Text", () => {
    assert.throws(() => erzeugeQrMatrix(""), /nicht leerer Text/);
    assert.throws(() => erzeugeQrMatrix("   "), /nicht leerer Text/);
  });

  it("nimmt bei unbekannter Stufe die Stufe M", () => {
    const mitUnbekannt = erzeugeQrMatrix(DEMO_LINK, { stufe: "X" as QrStufe });
    assert.equal(mitUnbekannt.stufe, "M");
    assert.deepEqual(
      alsZeilen(mitUnbekannt),
      alsZeilen(erzeugeQrMatrix(DEMO_LINK, { stufe: "M", version: mitUnbekannt.version })),
    );
  });
});

describe("QR-Encoder: SVG-Ausgabe", () => {
  /** Liest die Pfadbefehle zurück in eine Matrix — so wie ein Scanner das Bild sieht. */
  function ausSvg(
    svg: string,
    groesse: number,
    rand: number,
    modul: number,
  ): boolean[][] {
    const raster = Array.from({ length: groesse }, () =>
      new Array<boolean>(groesse).fill(false),
    );
    const befehle = [...svg.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-(\d+)z/g)];
    assert.ok(befehle.length > 0, "keine Pfadbefehle im SVG");
    for (const befehl of befehle) {
      const x = Number(befehl[1]);
      const y = Number(befehl[2]);
      const breite = Number(befehl[3]);
      const hoehe = Number(befehl[4]);
      assert.equal(Number(befehl[5]), breite, "Rechteck muss geschlossen sein");
      assert.equal(hoehe, modul, "Rechteckhöhe muss ein Modul sein");
      assert.equal(x % modul, 0, "x muss auf dem Modulraster liegen");
      assert.equal(y % modul, 0, "y muss auf dem Modulraster liegen");
      assert.equal(breite % modul, 0, "Breite muss ein Vielfaches des Moduls sein");
      const spalte = x / modul - rand;
      const zeile = y / modul - rand;
      for (let i = 0; i < breite / modul; i += 1) raster[zeile][spalte + i] = true;
    }
    return raster;
  }

  it("erzeugt gültiges SVG mit Ruhezone von vier Modulen", () => {
    const matrix = erzeugeQrMatrix(DEMO_LINK);
    const svg = qrAlsSvg(DEMO_LINK);
    const kante = (matrix.groesse + 8) * 8;
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, new RegExp(`width="${kante}" height="${kante}"`));
    assert.match(svg, new RegExp(`viewBox="0 0 ${kante} ${kante}"`));
    assert.match(svg, /<title>QR-Code<\/title>/);
    assert.match(svg, /<rect width="\d+" height="\d+" fill="#ffffff"\/>/);
    assert.ok(svg.endsWith("</svg>"));
    assert.ok(!svg.includes("NaN"), "keine ungültigen Zahlen im Pfad");

    const raster = ausSvg(svg, matrix.groesse, 4, 8);
    assert.deepEqual(alsZeilen({ ...matrix, module: raster }), alsZeilen(matrix));

    // Ruhezone: kein Pfadbefehl näher als vier Module am Rand.
    for (const befehl of svg.matchAll(/M(\d+) (\d+)/g)) {
      assert.ok(Number(befehl[1]) >= 4 * 8, "Ruhezone links");
      assert.ok(Number(befehl[2]) >= 4 * 8, "Ruhezone oben");
    }
  });

  it("nimmt Ruhezone, Modulgröße, Farben und Titel an", () => {
    const svg = qrAlsSvg(DEMO_LINK, {
      rand: 6,
      modulGroesse: 4,
      farbe: "#134e4a",
      hintergrund: "#f8fafc",
      titel: "Kundenlink <Berger> & Co",
      stufe: "Q",
    });
    const matrix = erzeugeQrMatrix(DEMO_LINK, { stufe: "Q" });
    const kante = (matrix.groesse + 12) * 4;
    assert.match(svg, new RegExp(`width="${kante}" height="${kante}"`));
    assert.match(svg, /fill="#134e4a"/);
    assert.match(svg, /fill="#f8fafc"/);
    assert.match(svg, /<title>Kundenlink &lt;Berger&gt; &amp; Co<\/title>/);
    const raster = ausSvg(svg, matrix.groesse, 6, 4);
    assert.deepEqual(alsZeilen({ ...matrix, module: raster }), alsZeilen(matrix));
  });

  it("erzwingt mindestens vier Module Ruhezone", () => {
    const matrix = erzeugeQrMatrix(DEMO_LINK);
    for (const rand of [0, 1, 3, -2]) {
      const svg = qrAlsSvg(DEMO_LINK, { rand });
      const kante = (matrix.groesse + 8) * 8;
      assert.match(svg, new RegExp(`width="${kante}" height="${kante}"`));
    }
  });

  it("kommt auch mit Version 10 zurecht", () => {
    const text = "x".repeat(kapazitaet(10, "L"));
    const matrix = erzeugeQrMatrix(text, { stufe: "L", version: 10 });
    const svg = qrAlsSvg(text, { stufe: "L", modulGroesse: 2 });
    const kante = (matrix.groesse + 8) * 2;
    assert.match(svg, new RegExp(`width="${kante}" height="${kante}"`));
    const raster = ausSvg(svg, matrix.groesse, 4, 2);
    assert.deepEqual(alsZeilen({ ...matrix, module: raster }), alsZeilen(matrix));
  });
});

describe("QR-Encoder: PNG-Ausgabe", () => {
  /** Zerlegt die PNG-Datei in Chunks und prüft Länge und CRC-32 (über zlib). */
  function chunks(png: Uint8Array): { typ: string; daten: Uint8Array }[] {
    const signatur = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    assert.deepEqual(Array.from(png.slice(0, 8)), signatur, "PNG-Signatur fehlt");
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const ergebnis: { typ: string; daten: Uint8Array }[] = [];
    let position = 8;
    while (position < png.length) {
      const laenge = view.getUint32(position);
      const typ = new TextDecoder().decode(png.slice(position + 4, position + 8));
      const daten = png.slice(position + 8, position + 8 + laenge);
      const crc = view.getUint32(position + 8 + laenge);
      assert.equal(
        crc,
        zlibCrc32(png.slice(position + 4, position + 8 + laenge)),
        `CRC-32 des Chunks ${typ} stimmt nicht`,
      );
      ergebnis.push({ typ, daten });
      position += 12 + laenge;
    }
    assert.equal(position, png.length, "PNG endet nicht auf einer Chunk-Grenze");
    return ergebnis;
  }

  it("erzeugt eine strukturell gültige PNG-Datei", () => {
    const png = qrAlsPng(DEMO_LINK);
    const teile = chunks(png);
    assert.deepEqual(teile.map((teil) => teil.typ), ["IHDR", "IDAT", "IEND"]);
    const matrix = erzeugeQrMatrix(DEMO_LINK);
    const kante = (matrix.groesse + 8) * 8;
    const ihdr = new DataView(teile[0].daten.buffer, teile[0].daten.byteOffset);
    assert.equal(ihdr.getUint32(0), kante, "Breite in IHDR");
    assert.equal(ihdr.getUint32(4), kante, "Höhe in IHDR");
    assert.equal(teile[0].daten[8], 1, "Bittiefe 1");
    assert.equal(teile[0].daten[9], 0, "Farbtyp 0 = Graustufen");
    assert.equal(teile[0].daten[10], 0, "Kompression = Deflate");
    assert.equal(teile[0].daten[11], 0, "Filterverfahren 0");
    assert.equal(teile[0].daten[12], 0, "kein Interlacing");
    assert.equal(teile[2].daten.length, 0, "IEND ist leer");
  });

  it("betten Bilddaten ein, die sich zu genau dieser Matrix entpacken lassen", () => {
    // inflateSync aus Node ist eine fremde Implementierung des zlib-Stroms.
    for (const fall of [
      { text: DEMO_LINK, stufe: "M" as QrStufe, rand: 4, modulGroesse: 8 },
      { text: "https://werkstattflow.example.de/w/kfz-werkstatt-berger?quelle=theke", stufe: "Q" as QrStufe, rand: 4, modulGroesse: 3 },
      { text: "Ölwechsel für Kühe – 30 €", stufe: "H" as QrStufe, rand: 6, modulGroesse: 5 },
    ]) {
      const png = qrAlsPng(fall.text, { stufe: fall.stufe, rand: fall.rand, modulGroesse: fall.modulGroesse });
      const matrix = erzeugeQrMatrix(fall.text, { stufe: fall.stufe });
      const idat = chunks(png).find((teil) => teil.typ === "IDAT");
      assert.ok(idat, "IDAT fehlt");
      const roh = new Uint8Array(inflateSync(Buffer.from(idat.daten)));
      const seiten = matrix.groesse + fall.rand * 2;
      const kante = seiten * fall.modulGroesse;
      const zeilenBytes = Math.ceil(kante / 8);
      assert.equal(roh.length, (zeilenBytes + 1) * kante, "Größe der Bilddaten");
      for (let zeile = 0; zeile < kante; zeile += 1) {
        assert.equal(roh[zeile * (zeilenBytes + 1)], 0, "Filterbyte muss 0 sein");
      }
      const pixelWeiss = (px: number, py: number) =>
        ((roh[py * (zeilenBytes + 1) + 1 + (px >> 3)] >> (7 - (px & 7))) & 1) === 1;
      for (let zeile = 0; zeile < seiten; zeile += 1) {
        for (let spalte = 0; spalte < seiten; spalte += 1) {
          const px = Math.floor((spalte + 0.5) * fall.modulGroesse);
          const py = Math.floor((zeile + 0.5) * fall.modulGroesse);
          const imRaster =
            zeile >= fall.rand &&
            spalte >= fall.rand &&
            zeile < fall.rand + matrix.groesse &&
            spalte < fall.rand + matrix.groesse;
          const erwartetDunkel = imRaster
            ? matrix.module[zeile - fall.rand][spalte - fall.rand]
            : false;
          assert.equal(
            pixelWeiss(px, py),
            !erwartetDunkel,
            `Modul (${zeile},${spalte}) im PNG falsch gefärbt`,
          );
        }
      }
    }
  });

  it("hält die Ruhezone im PNG weiß", () => {
    const matrix = erzeugeQrMatrix(DEMO_LINK);
    const rand = 4;
    const modul = 8;
    const png = qrAlsPng(DEMO_LINK, { rand, modulGroesse: modul });
    const idat = chunks(png).find((teil) => teil.typ === "IDAT");
    const roh = new Uint8Array(inflateSync(Buffer.from(idat!.daten)));
    const kante = (matrix.groesse + rand * 2) * modul;
    const zeilenBytes = Math.ceil(kante / 8);
    const grenze = rand * modul;
    for (let py = 0; py < kante; py += 1) {
      for (const px of [0, grenze - 1, kante - grenze, kante - 1]) {
        const weiss =
          ((roh[py * (zeilenBytes + 1) + 1 + (px >> 3)] >> (7 - (px & 7))) & 1) === 1;
        const imStreifen =
          py < grenze || py >= kante - grenze || px < grenze || px >= kante - grenze;
        if (imStreifen) assert.equal(weiss, true, `Ruhezone bei (${px},${py}) nicht weiß`);
      }
    }
  });

  it("verlangt auch beim PNG einen nicht leeren Text", () => {
    assert.throws(() => qrAlsPng(""), /nicht leerer Text/);
  });

  it("bleibt für Version 10 unter der Blockgrenze des Deflate-Stroms", () => {
    const text = "x".repeat(kapazitaet(10, "H"));
    const png = qrAlsPng(text, { stufe: "H", version: 10, modulGroesse: 4 });
    const idat = chunks(png).find((teil) => teil.typ === "IDAT");
    assert.ok(idat, "IDAT fehlt");
    const roh = new Uint8Array(inflateSync(Buffer.from(idat!.daten)));
    const kante = (57 + 8) * 4;
    assert.equal(roh.length, (Math.ceil(kante / 8) + 1) * kante);
  });
});

describe("QR-Dateiname", () => {
  it("bildet den Werkstattnamen auf einen Dateinamen ab", () => {
    const faelle: [string, string][] = [
      ["Kfz-Werkstatt Berger", "qr-code-kfz-werkstatt-berger.svg"],
      ["Kfz-Werkstatt Berger", "qr-code-kfz-werkstatt-berger.png"],
      ["Autohaus Müller & Söhne", "qr-code-autohaus-mueller-soehne.svg"],
      ["Bäckerei Groß", "qr-code-baeckerei-gross.svg"],
      ["ÄÖÜ äöü ß", "qr-code-aeoeue-aeoeue-ss.svg"],
      ["  Rand   mit   Leerraum  ", "qr-code-rand-mit-leerraum.svg"],
      ["Werkstatt #1 / Nord", "qr-code-werkstatt-1-nord.svg"],
      ["Werkstatt 2.0 (Hauptfiliale)", "qr-code-werkstatt-2-0-hauptfiliale.svg"],
      ["!!!", "qr-code-werkstatt.svg"],
      ["", "qr-code-werkstatt.svg"],
      ["///", "qr-code-werkstatt.svg"],
      ["Émile`s Garage", "qr-code-mile-s-garage.svg"],
    ];
    for (const [name, erwartet] of faelle) {
      assert.equal(
        qrDateiname(name, erwartet.endsWith(".png") ? "png" : "svg"),
        erwartet,
      );
    }
  });

  it("schneidet lange Namen bei 60 Zeichen ab, auch mit Trennstrich am Ende", () => {
    const lang = ["Kfz-Werkstatt ", "Auto Müller ", "Reifen & Räder GmbH "].join("").repeat(3);
    const name = qrDateiname(lang);
    const mitte = name.slice("qr-code-".length, -".svg".length);
    assert.ok(mitte.length <= 60, "auf höchstens 60 Zeichen gekürzt");
    assert.ok(!mitte.endsWith("-"), "kein Trennstrich am Ende");
    assert.equal(name, `qr-code-${mitte}.svg`);
    assert.equal(
      qrDateiname("Kfz-Werkstatt ".repeat(10)).slice("qr-code-".length, -".svg".length),
      "kfz-werkstatt-kfz-werkstatt-kfz-werkstatt-kfz-werkstatt-kfz-work",
    );
  });

  it("hat nie einen Trennstrich vor der Endung", () => {
    for (const laenge of Array.from({ length: 120 }, (_, i) => i + 1)) {
      const name = qrDateiname("Werkstatt " + "a".repeat(laenge) + " Auto");
      assert.match(name, /^qr-code-[a-z0-9-]+\.svg$/);
      assert.ok(!name.includes("-."), `Trennstrich vor der Endung: ${name}`);
      assert.ok(name.length <= "qr-code-".length + 60 + ".svg".length, "zu lang");
    }
  });

  it("bereinigt eine unbrauchbare Endung", () => {
    assert.equal(qrDateiname("Berger", "PNG"), "qr-code-berger.png");
    assert.equal(qrDateiname("Berger", ""), "qr-code-berger.svg");
    assert.equal(qrDateiname("Berger", "../etc/passwd"), "qr-code-berger.svg");
    assert.equal(qrDateiname("Berger", "s?v=g"), "qr-code-berger.svg");
  });
});
