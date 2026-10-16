"use client";

import { useActionState, useState } from "react";
import { CalendarCheck, ThumbsDown } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  bestaetigeAnfrageAction,
  lehneAnfrageAction,
  setzeAnfrageStatusAction,
  type AktionsZustand,
} from "@/lib/actions/dashboard";

/**
 * Aktionen zu einer Anfrage: Termin bestätigen (Dialog) und ablehnen (Dialog mit
 * Pflicht-Begründung), dazu Abschließen und Stornieren.
 *
 * Beide Dialoge senden an Server Actions. Fehler kommen als deutsche Meldung
 * zurück und werden IM Dialog angezeigt, damit die Eingabe nicht verloren geht.
 */
export function AnfrageAktionen({
  anfrageId,
  status,
  slotMinuten,
  wunschVon,
  wunschBis,
}: {
  anfrageId: string;
  status: string;
  slotMinuten: number;
  wunschVon: string | null;
  wunschBis: string | null;
}) {
  const [bestaetigenZustand, bestaetigen] = useActionState<AktionsZustand, FormData>(
    bestaetigeAnfrageAction,
    { status: "ruhe" },
  );
  const [ablehnenZustand, ablehnen] = useActionState<AktionsZustand, FormData>(
    lehneAnfrageAction,
    { status: "ruhe" },
  );
  const [statusZustand, setzeStatus] = useActionState<AktionsZustand, FormData>(
    setzeAnfrageStatusAction,
    { status: "ruhe" },
  );

  const [bestaetigenOffen, setBestaetigenOffen] = useState(false);
  const [ablehnenOffen, setAblehnenOffen] = useState(false);

  const heuteIso = new Date().toISOString().slice(0, 10);

  if (status === "neu") {
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          {/* Bestätigen ---------------------------------------------------- */}
          <Dialog open={bestaetigenOffen} onOpenChange={setBestaetigenOffen}>
            <DialogTrigger asChild>
              <Button className="w-full sm:w-auto">
                <CalendarCheck className="h-4 w-4" />
                Termin bestätigen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Termin bestätigen</DialogTitle>
                <DialogDescription>
                  Wählen Sie den verbindlichen Termin. Die Dauer ist mit{" "}
                  {slotMinuten} Minuten vorgeschlagen; der Termin wird beim
                  Bestätigen im Kalender eingetragen.
                </DialogDescription>
              </DialogHeader>

              <form action={bestaetigen} className="space-y-4">
                <input type="hidden" name="anfrage_id" value={anfrageId} />

                <div className="space-y-2">
                  <Label htmlFor="termin_datum">Datum</Label>
                  <Input
                    id="termin_datum"
                    name="termin_datum"
                    type="date"
                    required
                    min={heuteIso}
                    defaultValue={wunschVon ?? ""}
                    max={wunschBis ?? undefined}
                  />
                  {wunschVon && (
                    <p className="text-xs text-muted-foreground">
                      Wunschtermin des Kunden: {wunschVon}
                      {wunschBis && wunschBis !== wunschVon ? ` – ${wunschBis}` : ""}
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="termin_uhrzeit">Uhrzeit</Label>
                    <Input
                      id="termin_uhrzeit"
                      name="termin_uhrzeit"
                      type="time"
                      required
                      step={300}
                      defaultValue="08:00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="termin_dauer">Dauer (Minuten)</Label>
                    <Input
                      id="termin_dauer"
                      name="termin_dauer"
                      type="number"
                      min={15}
                      max={480}
                      step={15}
                      defaultValue={slotMinuten}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="termin_bay">Arbeitsplatz (optional)</Label>
                  <Input
                    id="termin_bay"
                    name="termin_bay"
                    placeholder="z. B. Bühne 1"
                    maxLength={80}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="termin_notiz">Interne Notiz (optional)</Label>
                  <Textarea
                    id="termin_notiz"
                    name="termin_notiz"
                    rows={2}
                    maxLength={1000}
                    placeholder="z. B. Kunde bringt das Fahrzeug um 8 Uhr."
                  />
                </div>

                {bestaetigenZustand.status === "fehler" && (
                  <Alert variant="destructive">
                    <AlertDescription>{bestaetigenZustand.meldung}</AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setBestaetigenOffen(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button type="submit">Termin verbindlich bestätigen</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Ablehnen ------------------------------------------------------ */}
          <Dialog open={ablehnenOffen} onOpenChange={setAblehnenOffen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <ThumbsDown className="h-4 w-4" />
                Anfrage ablehnen
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Anfrage ablehnen</DialogTitle>
                <DialogDescription>
                  Die Begründung ist Pflicht: der Kunde sieht sie auf seiner
                  Statusseite und weiß, woran er ist.
                </DialogDescription>
              </DialogHeader>

              <form action={ablehnen} className="space-y-4">
                <input type="hidden" name="anfrage_id" value={anfrageId} />
                <div className="space-y-2">
                  <Label htmlFor="begruendung">Begründung für den Kunden</Label>
                  <Textarea
                    id="begruendung"
                    name="begruendung"
                    rows={4}
                    required
                    minLength={5}
                    maxLength={2000}
                    placeholder="z. B. Auslastung in diesem Zeitraum — wir können den Auftrag erst ab dem 20. annehmen."
                  />
                </div>

                {ablehnenZustand.status === "fehler" && (
                  <Alert variant="destructive">
                    <AlertDescription>{ablehnenZustand.meldung}</AlertDescription>
                  </Alert>
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAblehnenOffen(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button type="submit" variant="destructive">
                    Anfrage ablehnen
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Stornieren (auch aus "neu" möglich) ------------------------------ */}
        <form action={setzeStatus}>
          <input type="hidden" name="anfrage_id" value={anfrageId} />
          <input type="hidden" name="ziel_status" value="storniert" />
          <Button type="submit" variant="ghost" size="sm">
            Anfrage stornieren (Kunde zieht zurück)
          </Button>
        </form>

        {statusZustand.status === "fehler" && (
          <Alert variant="destructive">
            <AlertDescription>{statusZustand.meldung}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  if (status === "bestaetigt") {
    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <form action={setzeStatus}>
            <input type="hidden" name="anfrage_id" value={anfrageId} />
            <input type="hidden" name="ziel_status" value="abgeschlossen" />
            <Button type="submit" className="w-full sm:w-auto">
              Auftrag abgeschlossen
            </Button>
          </form>
          <form action={setzeStatus}>
            <input type="hidden" name="anfrage_id" value={anfrageId} />
            <input type="hidden" name="ziel_status" value="storniert" />
            <Button type="submit" variant="outline" className="w-full sm:w-auto">
              Auftrag stornieren
            </Button>
          </form>
        </div>

        {statusZustand.status === "fehler" && (
          <Alert variant="destructive">
            <AlertDescription>{statusZustand.meldung}</AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      Diese Anfrage ist abgeschlossen — es sind keine weiteren Schritte nötig.
    </p>
  );
}
