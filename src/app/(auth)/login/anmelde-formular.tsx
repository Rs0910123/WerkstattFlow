"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { anmeldenAction, type AuthFormularStatus } from "@/lib/actions/auth";

const START: AuthFormularStatus = {};

export function AnmeldeFormular({
  weiter,
  startFehler,
  startHinweis,
}: {
  weiter: string;
  startFehler?: string;
  startHinweis?: string;
}) {
  const [status, formAction, laeuft] = useActionState(anmeldenAction, START);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="weiter" value={weiter} />

      {(status.fehler || startFehler) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{status.fehler ?? startFehler}</AlertDescription>
        </Alert>
      )}

      {startHinweis && !status.fehler && !startFehler && (
        <Alert variant="info">
          <AlertDescription>{startHinweis}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">E-Mail-Adresse</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="werkstatt@beispiel.de"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="password">Passwort</Label>
          <Link
            href="/passwort-vergessen"
            className="text-xs text-brand underline-offset-4 hover:underline"
          >
            Passwort vergessen?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={laeuft}>
        {laeuft && <Loader2 className="h-4 w-4 animate-spin" />}
        {laeuft ? "Wird angemeldet …" : "Anmelden"}
      </Button>

      {status.erfolg && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{status.erfolg}</AlertDescription>
        </Alert>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Noch keine Werkstatt angelegt?{" "}
        <Link
          href="/registrieren"
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          Jetzt registrieren
        </Link>
      </p>
    </form>
  );
}
