import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { PasswortVergessenFormular } from "./passwort-vergessen-formular";

export const metadata: Metadata = { title: "Passwort vergessen" };

export default function PasswortVergessenSeite() {
  return (
    <Card className="border-border/70">
      <CardHeader>
        <CardTitle className="text-2xl">Passwort vergessen?</CardTitle>
        <CardDescription>
          Geben Sie Ihre E-Mail-Adresse ein. Wir schicken Ihnen einen Link, mit
          dem Sie ein neues Passwort vergeben können.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PasswortVergessenFormular />
      </CardContent>
    </Card>
  );
}
