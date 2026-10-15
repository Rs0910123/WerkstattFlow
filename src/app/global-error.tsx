"use client";

/**
 * Letzte Auffangseite: greift, wenn schon das Grundgerüst (html/body) fehlschlägt.
 * Bewusst ohne eigene Komponenten-Bibliothek, damit sie notfalls immer rendert.
 */
export default function GlobalerFehler({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body
        style={{
          fontFamily:
            "Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
          color: "#1f2a37",
        }}
      >
        <div
          style={{
            maxWidth: "32rem",
            padding: "2.5rem",
            textAlign: "center",
            border: "1px solid #e5e8ec",
            borderRadius: "0.75rem",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", margin: 0 }}>
            Die Anwendung konnte nicht starten
          </h1>
          <p
            style={{
              marginTop: "1rem",
              fontSize: "0.9rem",
              lineHeight: 1.6,
              color: "#4b5563",
            }}
          >
            Bitte prüfen Sie, ob die Datei{" "}
            <code>.env.local</code> vorhanden und vollständig ausgefüllt ist
            (NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY). Die
            README erklärt die Schritte unter „Supabase verbinden“.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.6rem 1.2rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#0A6E78",
              color: "#ffffff",
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  );
}
