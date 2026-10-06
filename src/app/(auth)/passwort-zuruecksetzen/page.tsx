import type { Metadata } from "next";
import Link from "next/link";

import { SetupHinweis } from "@/components/setup-hinweis";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

import { PasswortZuruecksetzenFormular } from "./passwort-zuruecksetzen-formular";

export const metadata: Metadata = { title: "Neues Passwort vergeben" };

export default function PasswortZuruecksetzenSeite() {
  return (
    <>
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-2xl">Neues Passwort vergeben</CardTitle>
          <CardDescription>
            Sie sind über den Link aus der E-Mail hier. Bitte vergeben Sie jetzt
            ein neues Passwort für Ihr Konto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasswortZuruecksetzenFormular />
          <p className="mt-5 text-center text-xs text-muted-foreground">
            Der Link ist abgelaufen?{" "}
            <Link
              href="/passwort-vergessen"
              className="text-brand underline-offset-4 hover:underline"
            >
              Neuen Link anfordern
            </Link>
          </p>
        </CardContent>
      </Card>

      {!isSupabaseConfigured && (
        <SetupHinweis kontext="Das Zurücksetzen des Passworts ist fertig gebaut." />
      )}
    </>
  );
}
