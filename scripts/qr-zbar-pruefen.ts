/**
 * Prüft die von src/lib/dashboard/qr.ts erzeugten QR-Codes mit einem echten
 * Decoder (zbar). Das ist der einzige Nachweis, der wirklich Scannbarkeit
 * belegt: PNG-Datei schreiben, zurücklesen und den Text mit der Eingabe
 * vergleichen — zusätzlich dieselbe Matrix als SVG, mit rsvg-convert
 * gerastert und ebenfalls zurückgelesen.
 *
 * Nötige Werkzeuge (bewusst KEINE Projektabhängigkeit):
 *   apt-get install -y zbar-tools librsvg2-bin
 *
 * Aufruf:  node --experimental-strip-types scripts/qr-zbar-pruefen.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  qrAlsPng,
  qrAlsSvg,
  type QrStufe,
  type SvgOptionen,
} from "../src/lib/dashboard/qr.ts";

type ReferenzFall = {
  gruppe: string;
  name: string;
  text: string;
  version: number;
  stufe: QrStufe;
  maske: number | null;
};

const referenz: {
  faelle: ReferenzFall[];
  automatisch: { name: string; text: string; version: number; stufe: QrStufe }[];
} = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../tests/dashboard/qr-referenz.json", import.meta.url)),
    "utf8",
  ),
);

const verzeichnis = "/tmp/qrzbar";
mkdirSync(verzeichnis, { recursive: true });

const faelle: ReferenzFall[] = [
  ...referenz.faelle,
  ...referenz.automatisch.map((fall) => ({
    gruppe: "automatisch",
    name: fall.name,
    text: fall.text,
    version: fall.version,
    stufe: fall.stufe,
    maske: null,
  })),
  // Zusätzlich die Fälle, die im Betrieb wirklich vorkommen.
  {
    gruppe: "betrieb",
    name: "demo-link",
    text: "/w/kfz-werkstatt-berger",
    version: 0,
    stufe: "M",
    maske: null,
  },
  {
    gruppe: "betrieb",
    name: "lange-url",
    text: "https://werkstattflow.example.de/w/kfz-werkstatt-berger?quelle=theke&hinweis=termin",
    version: 0,
    stufe: "M",
    maske: null,
  },
  {
    gruppe: "betrieb",
    name: "umlaute",
    text: "Ölwechsel für Kühe – 30 €",
    version: 0,
    stufe: "M",
    maske: null,
  },
];

function optionenFuer(fall: ReferenzFall): SvgOptionen {
  const optionen: SvgOptionen = { stufe: fall.stufe, modulGroesse: 4 };
  if (fall.version >= 1) optionen.version = fall.version;
  if (fall.maske !== null && fall.maske !== undefined) optionen.maske = fall.maske;
  return optionen;
}

/**
 * zbarimg gibt bei jedem Aufruf zwei Zeilen D-Bus-Rauschen auf stderr aus
 * ("Connection Null" / "Connection Error ...") — auf diesem Rechner gibt es
 * keinen Systembus, und zbar braucht auch keinen, um ein Bild zu lesen.
 * execFileSync leitet stderr des Kindprozesses standardmäßig auf unser stderr
 * weiter; deshalb wird es hier ausdrücklich verworfen, damit die Prüfausgabe
 * lesbar bleibt. Ausgewertet wird ausschließlich stdout.
 */
const STILLE_STDIO: ["ignore", "pipe", "ignore"] = ["ignore", "pipe", "ignore"];
function lese(datei: string): string {
  try {
    return execFileSync("zbarimg", ["--raw", "-q", datei], {
      encoding: "utf8",
      stdio: STILLE_STDIO,
    }).replace(/\n$/, "");
  } catch {
    return "<nicht gelesen>";
  }
}

let pngOk = 0;
let svgOk = 0;
const fehlschlaege: string[] = [];

for (const fall of faelle) {
  const optionen = optionenFuer(fall);
  const basis = `${verzeichnis}/${fall.gruppe}-${fall.name}`;
  writeFileSync(`${basis}.png`, qrAlsPng(fall.text, optionen));
  writeFileSync(`${basis}.svg`, qrAlsSvg(fall.text, optionen));
  execFileSync("rsvg-convert", ["-o", `${basis}-svg.png`, `${basis}.svg`], { stdio: STILLE_STDIO });

  const ausPng = lese(`${basis}.png`);
  const ausSvg = lese(`${basis}-svg.png`);
  if (ausPng === fall.text) pngOk += 1;
  else fehlschlaege.push(`${fall.name} (PNG): "${ausPng}" statt "${fall.text}"`);
  if (ausSvg === fall.text) svgOk += 1;
  else fehlschlaege.push(`${fall.name} (SVG): "${ausSvg}" statt "${fall.text}"`);
}

console.log(`Fälle: ${faelle.length}`);
console.log(`PNG (zbar): ${pngOk}/${faelle.length} exakt richtig`);
console.log(`SVG → rsvg-convert → PNG (zbar): ${svgOk}/${faelle.length} exakt richtig`);
for (const fehler of fehlschlaege.slice(0, 10)) console.log(`  FEHLER ${fehler}`);
console.log(`Fehlschläge gesamt: ${fehlschlaege.length}`);
