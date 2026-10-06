import { AlertCircle, Plug } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { missingSupabaseVariables } from "@/lib/env";

/**
 * Hinweis, der erscheint, solange Supabase noch nicht verbunden ist.
 *
 * Er verhindert, dass die App in einen weißen Fehlerbildschirm läuft: Statt
 * eines Absturzes erklären wir auf Deutsch, was fehlt und was zu tun ist.
 */
export function SetupHinweis({ kontext }: { kontext?: string }) {
  return (
    <Alert variant="warning" className="my-6">
      <Plug className="h-4 w-4" />
      <AlertTitle>Supabase ist noch nicht verbunden</AlertTitle>
      <AlertDescription>
        <p>
          {kontext
            ? `${kontext} Dafür fehlen noch die Zugangsdaten.`
            : "Für diesen Bereich fehlen noch die Zugangsdaten."}
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Datei <code className="rounded bg-muted px-1">.env.example</code>{" "}
            kopieren:{" "}
            <code className="rounded bg-muted px-1">
              cp .env.example .env.local
            </code>
          </li>
          <li>
            In{" "}
            <code className="rounded bg-muted px-1">.env.local</code> diese
            Werte eintragen:{" "}
            {missingSupabaseVariables.length > 0
              ? missingSupabaseVariables.join(", ")
              : "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY"}
          </li>
          <li>
            Entwicklungsserver neu starten (
            <code className="rounded bg-muted px-1">npm run dev</code>).
          </li>
        </ol>
        <p className="mt-2 flex items-start gap-2 text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Wo die beiden Werte zu finden sind, steht Schritt für Schritt in der
            README unter „Supabase verbinden“.
          </span>
        </p>
      </AlertDescription>
    </Alert>
  );
}
