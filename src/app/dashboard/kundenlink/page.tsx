import Link from "next/link";
import { Download, Info } from "lucide-react";

import { SetupHinweis } from "@/components/setup-hinweis";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ladeDashboardKontext } from "@/lib/dashboard/daten.ts";
import { kundenlinkUrl } from "@/lib/dashboard/kundenlink.ts";
import { qrAlsSvg, qrDateiname } from "@/lib/dashboard/qr.ts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kundenlink" };

/**
 * Kundenlink und QR-Code zum Aushängen (Baustein 3, Teil B1b).
 *
 * Die QR-Dateien entstehen serverseitig in der Route
 * /dashboard/kundenlink/qr/[format] — kein Fremdaufruf, kein Dienst von außen.
 * Die Vorschau nutzt dieselbe Funktion (qrAlsSvg) wie der Download.
 */
export default async function KundenlinkSeite() {
  const kontext = await ladeDashboardKontext();

  if (kontext.status === "nicht_konfiguriert") {
    return (
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Kundenlink</h1>
        <SetupHinweis kontext="Kundenlink und QR-Code sind fertig gebaut." />
      </div>
    );
  }

  if (kontext.status === "nicht_angemeldet" || kontext.status === "kein_profil") {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Kein Werkstatt-Zugang gefunden</AlertTitle>
        <AlertDescription>
          Bitte melden Sie sich an. Ohne Werkstatt-Zuordnung gibt es keinen
          Kundenlink.
        </AlertDescription>
      </Alert>
    );
  }

  if (kontext.status === "fehler") {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertTitle>Der Kundenlink konnte nicht geladen werden</AlertTitle>
        <AlertDescription>
          <p>Meldung: {kontext.meldung}</p>
        </AlertDescription>
      </Alert>
    );
  }

  const { firma } = kontext;
  const link = kundenlinkUrl(firma.slug);
  const svgDatei = qrDateiname(firma.name, "svg");
  const pngDatei = qrDateiname(firma.name, "png");
  const svg = qrAlsSvg(link, {
    modulGroesse: 6,
    titel: `Kundenlink der Werkstatt ${firma.name}`,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Kundenlink</h1>
        <p className="max-w-prose text-muted-foreground">
          Über diesen Link fragen Ihre Kunden online einen Termin an. Hängen Sie
          den QR-Code an der Theke auf oder drucken Sie ihn auf Ihre
          Visitenkarte — Kunden landen dann direkt auf Ihrer Terminseite.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">Ihr Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="break-all rounded-md bg-muted/60 px-3 py-2 font-mono text-sm">
              {link}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/w/${firma.slug}`}>Kundenseite ansehen</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              Der Kurzname Ihrer Werkstatt lautet{" "}
              <span className="font-medium">{firma.slug}</span>. Er ändert sich
              nur, wenn die Werkstatt neu angelegt wird — ein bereits gedruckter
              QR-Code bleibt also gültig.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="text-base">QR-Code herunterladen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className="mx-auto w-44 rounded-md border border-border/70 bg-white p-3 [&>svg]:h-full [&>svg]:w-full"
              // Der SVG-Quelltext kommt aus src/lib/dashboard/qr.ts (eigener
              // Code, Titel wird dort maskiert) — es sind keine fremden Daten.
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href="/dashboard/kundenlink/qr/svg" download={svgDatei}>
                  <Download className="h-4 w-4" />
                  SVG herunterladen
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="/dashboard/kundenlink/qr/png" download={pngDatei}>
                  <Download className="h-4 w-4" />
                  PNG herunterladen
                </a>
              </Button>
            </div>
            <div className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
              <p className="flex items-start gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-medium text-foreground">
                    SVG ({svgDatei})
                  </span>{" "}
                  ist für Druck geeignet (beliebig skalierbar, verlustfrei).{" "}
                  <span className="font-medium text-foreground">
                    PNG ({pngDatei})
                  </span>{" "}
                  für Anzeigen am Bildschirm, in sozialen Netzwerken oder in
                  Flyern.
                </span>
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Der QR-Code enthält genau die Adresse oben. Vor dem Druck bitte
              einmal mit dem Handy abscannen.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
