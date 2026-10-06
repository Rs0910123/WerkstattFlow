"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registrierenAction, type AuthFormularStatus } from "@/lib/actions/auth";

const START: AuthFormularStatus = {};

export function RegistrierungFormular() {
  const [status, formAction, laeuft] = useActionState(registrierenAction, START);

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
        <Label htmlFor="company_name">Name Ihrer Werkstatt</Label>
        <Input
          id="company_name"
          name="company_name"
          required
          autoComplete="organization"
          placeholder="Kfz-Werkstatt Berger"
          defaultValue={status.eingaben?.company_name}
        />
        <p className="text-xs text-muted-foreground">
          Erscheint später auf der öffentlichen Anfrageseite.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="full_name">Ihr Name</Label>
        <Input
          id="full_name"
          name="full_name"
          required
          autoComplete="name"
          placeholder="Martin Berger"
          defaultValue={status.eingaben?.full_name}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">E-Mail-Adresse</Label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          required
          autoComplete="email"
          placeholder="werkstatt@beispiel.de"
          defaultValue={status.eingaben?.email}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Passwort</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">Mindestens 8 Zeichen.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password_wiederholung">Passwort wiederholen</Label>
        <Input
          id="password_wiederholung"
          name="password_wiederholung"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      <Button type="submit" className="w-full" disabled={laeuft}>
        {laeuft && <Loader2 className="h-4 w-4 animate-spin" />}
        {laeuft ? "Wird angelegt …" : "Werkstatt registrieren"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Sie haben schon ein Konto?{" "}
        <Link
          href="/login"
          className="font-medium text-brand underline-offset-4 hover:underline"
        >
          Anmelden
        </Link>
      </p>
    </form>
  );
}
