"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  passwortVergessenAction,
  type AuthFormularStatus,
} from "@/lib/actions/auth";

const START: AuthFormularStatus = {};

export function PasswortVergessenFormular() {
  const [status, formAction, laeuft] = useActionState(
    passwortVergessenAction,
    START,
  );

  return (
    <form action={formAction} className="space-y-5">
      {status.fehler && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{status.fehler}</AlertDescription>
        </Alert>
      )}

      {status.erfolg && (
        <Alert variant="success">
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>{status.erfolg}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">E-Mail-Adresse Ihres Kontos</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          required
          autoComplete="email"
          placeholder="werkstatt@beispiel.de"
        />
      </div>

      <Button type="submit" className="w-full" disabled={laeuft}>
        {laeuft && <Loader2 className="h-4 w-4 animate-spin" />}
        {laeuft ? "Wird gesendet …" : "Link zum Zurücksetzen anfordern"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        <Link
          href="/login"
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          Zurück zur Anmeldung
        </Link>
      </p>
    </form>
  );
}
