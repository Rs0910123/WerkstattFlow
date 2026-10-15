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

import { AnmeldeFormular } from "./anmelde-formular";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginSeite({
  searchParams,
}: {
  searchParams: Promise<{ weiter?: string; hinweis?: string; fehler?: string }>;
}) {
  const parameter = await searchParams;
  const weiter = parameter.weiter?.startsWith("/") ? parameter.weiter : "/dashboard";

  return (
    <>
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-2xl">Willkommen zurück</CardTitle>
          <CardDescription>
            Melden Sie sich an, um die Anfragen Ihrer Werkstatt zu sehen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnmeldeFormular
            weiter={weiter}
            startFehler={parameter.fehler}
            startHinweis={parameter.hinweis}
          />
        </CardContent>
      </Card>

      {!isSupabaseConfigured && (
        <SetupHinweis kontext="Die Anmeldung ist fertig gebaut." />
      )}
    </>
  );
}
