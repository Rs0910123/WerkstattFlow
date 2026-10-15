import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-Klassen zusammenführen (Standard-Helfer von shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Datum im deutschen Format, z. B. 06.10.2026 */
export function formatDate(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {},
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options,
  }).format(date);
}

/** Datum + Uhrzeit im deutschen Format, z. B. 06.10.2026, 09:00 Uhr */
export function formatDateTime(value: string | Date | null | undefined): string {
  return formatDate(value, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Preis im deutschen Format, z. B. 249,00 € */
export function formatCurrency(
  value: number | string | null | undefined,
): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

/** Preisspanne, z. B. 180,00 € – 260,00 € */
export function formatPriceRange(
  from: number | string | null | undefined,
  to: number | string | null | undefined,
): string {
  if (from === null && to === null) return "Keine Schätzung";
  if (from !== null && to !== null && from !== to) {
    return `${formatCurrency(from)} – ${formatCurrency(to)}`;
  }
  return formatCurrency(from ?? to);
}
