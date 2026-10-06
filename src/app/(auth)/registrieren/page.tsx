import type { Metadata } from "next";

import { SetupHinweis } from "@/components/setup-hinweis";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

import { RegistrierungFormular } from "./registrierung-formular";

export const metadata: Metadata = { title: "Werkstatt registrieren" };

export default function RegistrierenSeite() {
  return (
    <>
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-2xl">Werkstatt registrieren</CardTitle>
          <CardDescription>
            Mit der Registrierung entsteht Ihr eigener, abgeschlossener Bereich —
            Ihre Daten sind von allen anderen Werkstätten getrennt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegistrierungFormular />
        </CardContent>
      </Card>

      {!isSupabaseConfigured && (
        <SetupHinweis kontext="Die Registrierung ist fertig gebaut." />
      )}
    </>
  );
}
