"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { neuesPasswortAction, type AuthFormularStatus } from "@/lib/actions/auth";

const START: AuthFormularStatus = {};

export function PasswortZuruecksetzenFormular() {
  const [status, formAction, laeuft] = useActionState(neuesPasswortAction, START);

  return (
    <form action={formAction} className="space-y-5">
      {status.fehler && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{status.fehler}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="password">Neues Passwort</Label>
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
        <Label htmlFor="password_wiederholung">Neues Passwort wiederholen</Label>
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
        {laeuft ? "Wird gespeichert …" : "Neues Passwort speichern"}
      </Button>
    </form>
  );
}
