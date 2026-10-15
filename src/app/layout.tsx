import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { appName } from "@/lib/env";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${appName} — Terminanfragen für Ihre Werkstatt`,
    template: `%s · ${appName}`,
  },
  description:
    "Mandantenfähige Plattform für Termin- und Auftragsanfragen: Kunden fragen online an, die Werkstatt bearbeitet alles in ihrem eigenen Dashboard.",
};

export const viewport: Viewport = {
  themeColor: "#0A6E78",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={inter.variable}>
      <body className="flex min-h-screen flex-col bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
