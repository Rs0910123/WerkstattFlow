import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { ladeDashboardKontext } from "@/lib/dashboard/daten.ts";
import { basisAusKopfzeilen, kundenlinkUrl } from "@/lib/dashboard/kundenlink.ts";
import { qrAlsPng, qrAlsSvg, qrDateiname } from "@/lib/dashboard/qr.ts";
import { siteUrl } from "@/lib/env.ts";

/**
 * Download des QR-Codes für den Kundenlink — serverseitig erzeugt.
 *
 * GET /dashboard/kundenlink/qr/svg  → SVG-Datei
 * GET /dashboard/kundenlink/qr/png  → PNG-Datei
 *
 * Die Datei entsteht aus der eigenen Fassade (src/lib/dashboard/qr.ts); es wird
 * kein fremder Dienst aufgerufen. Zugriff nur mit gültiger Werkstatt-Sitzung:
 * die Adresse der Werkstatt kommt aus der Sitzung, nicht aus der URL — eine
 * fremde Werkstatt kann hier also nicht ihren eigenen Link erfragen.
 *
 * Der Link zeigt auf dieselbe Instanz wie die laufende Anfrage
 * (x-forwarded-host), damit ein heruntergeladener QR-Code auch dann stimmt,
 * wenn NEXT_PUBLIC_SITE_URL nicht gesetzt ist.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _anfrage: Request,
  { params }: { params: Promise<{ format: string }> },
) {
  const { format } = await params;
  const endung = (format ?? "").toLowerCase();

  if (endung !== "svg" && endung !== "png") {
    return NextResponse.json(
      { fehler: "Unbekanntes Format. Möglich sind svg und png." },
      { status: 404 },
    );
  }

  const kontext = await ladeDashboardKontext();
  if (kontext.status !== "ok") {
    return NextResponse.json(
      { fehler: "Bitte melden Sie sich an, um den QR-Code herunterzuladen." },
      { status: kontext.status === "nicht_konfiguriert" ? 503 : 401 },
    );
  }

  const kopfzeilen = await headers();
  const basis = basisAusKopfzeilen(
    kopfzeilen.get("x-forwarded-host") ?? kopfzeilen.get("host"),
    kopfzeilen.get("x-forwarded-proto"),
    siteUrl,
  );
  const link = kundenlinkUrl(kontext.firma.slug, basis);
  const dateiname = qrDateiname(kontext.firma.name, endung);
  const titel = `Kundenlink der Werkstatt ${kontext.firma.name}`;

  const gemeinsam = {
    "Content-Disposition": `attachment; filename="${dateiname}"`,
    "Cache-Control": "private, no-store",
  };

  if (endung === "svg") {
    return new NextResponse(qrAlsSvg(link, { modulGroesse: 8, titel }), {
      headers: { ...gemeinsam, "Content-Type": "image/svg+xml; charset=utf-8" },
    });
  }

  const png = qrAlsPng(link, { modulGroesse: 8 });
  const puffer = png.buffer.slice(
    png.byteOffset,
    png.byteOffset + png.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(puffer, {
    headers: { ...gemeinsam, "Content-Type": "image/png" },
  });
}
