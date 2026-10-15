/**
 * Akzentfarbe einer Werkstatt: Hex-Wert aus der Datenbank -> CSS-Variable.
 *
 * Die Oberfläche liest ihre Akzentfarbe ausschließlich aus der CSS-Variablen
 * `--brand` (Triplett "H S% L%", siehe src/app/globals.css). Damit jede
 * Werkstatt ihr eigenes Petrol/Blau/Grün bekommt, wird ihr Hex-Wert
 * (companies.accent_color) hier in genau dieses Format umgerechnet.
 * Reine Funktion (tests/portal-basics.test.ts).
 */

export const PETROL_TRIPLETT = "188 86% 27%"; // #0A6E78

/** "#0A6E78" -> "188 86% 27%"; bei ungültiger Eingabe Petrol. */
export function hexZuHslTriplett(
  hex: string | null | undefined,
  fallback: string = PETROL_TRIPLETT,
): string {
  if (typeof hex !== "string") return fallback;
  const geputzt = hex.trim().replace(/^#/, "");
  const kurz = geputzt.length === 3;
  const lang = geputzt.length === 6;
  if (!(kurz || lang) || !/^[0-9a-fA-F]+$/.test(geputzt)) return fallback;

  const voll = kurz
    ? geputzt
        .split("")
        .map((zeichen) => zeichen + zeichen)
        .join("")
    : geputzt;

  const r = parseInt(voll.slice(0, 2), 16) / 255;
  const g = parseInt(voll.slice(2, 4), 16) / 255;
  const b = parseInt(voll.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return `${hue} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
}

/**
 * Aufhellte Variante für Flächen (`--brand-soft`), z. B. Hinweiskästen.
 * Sehr helle Farben bleiben unverändert, damit der Kontrast erhalten bleibt.
 */
export function hexZuWeichemTriplett(
  hex: string | null | undefined,
  fallback: string = "188 60% 96%",
): string {
  const basis = hexZuHslTriplett(hex, "188 86% 27%");
  const [h, s] = basis.split(" ");
  const saettigung = Math.min(60, Number.parseInt(s, 10) || 40);
  return `${h} ${saettigung}% 96%`;
}
