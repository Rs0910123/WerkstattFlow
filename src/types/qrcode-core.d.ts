/**
 * Typen für den reinen Kern der Bibliothek "qrcode" (node-qrcode, MIT).
 *
 * Warum der Tiefenimport `qrcode/lib/core/qrcode` statt `qrcode`?
 * Das Paket leitet den Haupteinstieg im Browser auf `lib/browser.js` um, und
 * dieser Renderer lädt `canvas` — im Browser-Bundle ein Fehler. Wir brauchen
 * aber nur die Modulmatrix; SVG und PNG schreibt src/lib/dashboard/qr.ts
 * selbst. `lib/core/qrcode` hängt ausschließlich von eigenen Modulen ab
 * (kein `canvas`, kein `pngjs`, kein `yargs`) und läuft unverändert im Browser.
 *
 * Das Paket bringt (Stand 1.5.4) keine eigenen Typen mit — daher diese
 * Deklaration mit genau der Fläche, die wir nutzen.
 */
declare module "qrcode/lib/core/qrcode.js" {
  /** Bitmatrix des erzeugten Codes: 1 = dunkles Modul. */
  export type QrKernMatrix = {
    /** Kantenlänge in Modulen. */
    size: number;
    get(zeile: number, spalte: number): 0 | 1;
  };

  export type QrKernErgebnis = {
    modules: QrKernMatrix;
    version: number;
    errorCorrectionLevel: "L" | "M" | "Q" | "H";
    maskPattern: number;
  };

  export type QrKernOptionen = {
    /** Erzwingt eine Version (1–40); ohne Angabe die kleinste passende. */
    version?: number;
    /** Fehlerkorrekturstufe, Standard "M". */
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    /** Erzwingt eine Maske (0–7); ohne Angabe wird die beste gewählt. */
    maskPattern?: number;
  };

  /** Ein Segment im Byte-Modus (so erzwingt die Fassade den Byte-Modus). */
  export type QrKernSegment = { data: string; mode: string };

  function create(
    daten: string | QrKernSegment[],
    optionen?: QrKernOptionen,
  ): QrKernErgebnis;

  export default { create };
}
