import Link from "next/link";

import { SiteFooter, SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";

export default function NichtGefunden() {
  return (
    <>
      <SiteHeader />
      <main className="container flex flex-1 flex-col justify-center py-24">
        <div className="max-w-xl">
          <p className="text-sm font-medium text-brand">Fehler 404</p>
          <h1 className="mt-3 text-3xl font-semibold">Seite nicht gefunden</h1>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Diese Adresse gibt es nicht (mehr). Vielleicht hat sich der Link
            geändert, oder die Seite gehört zu einem Baustein, der noch nicht
            gebaut ist.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/">Zur Startseite</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Zur Anmeldung</Link>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
