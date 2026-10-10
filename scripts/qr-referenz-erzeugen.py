#!/usr/bin/env python3
"""Erzeugt die Referenzmatrizen für tests/dashboard/qr-referenz.json.

Referenz ist die fremde Bibliothek `segno` (https://github.com/heuer/segno),
Byte-Modus, erzwungene Version, erzwungene Maske, boost_error=False.

Aufruf (nur zur Nachvollziehbarkeit, nicht Teil des Builds):
    pip install --target /tmp/qrref segno
    PYTHONPATH=/tmp/qrref python3 scripts/qr-referenz-erzeugen.py > /tmp/qr-referenz.json
"""
import json
import sys

import segno

STUFEN = ["L", "M", "Q", "H"]
MASKS = [0, 1, 2, 3, 4, 5, 6, 7]

TEXTE = {
    "demo": "/w/kfz-werkstatt-berger",
    "kurz": "1",
    "url": "https://werkstattflow.example.de/w/kfz-werkstatt-berger?quelle=theke&farbe=petrol",
    "umlaut": "Kfz-Werkstatt Berger – Terminanfrage für Kühe & Bäume (Ölwechsel) 30 €",
}


def kapazitaet(version: int, stufe: str) -> int:
    """Größte Byte-Anzahl, die in Version/Stufe passt — durch Ausprobieren."""
    klein, gross = 0, 2000
    while klein < gross:
        mitte = (klein + gross + 1) // 2
        try:
            segno.make("A" * mitte, version=version, error=stufe.lower(),
                       mask=0, boost_error=False, mode="byte", micro=False)
            klein = mitte
        except Exception as fehler:  # DataOverflowError
            if "Overflow" not in type(fehler).__name__:
                raise
            gross = mitte - 1
    return klein


def matrix_von(text: str, version, stufe: str, maske):
    qr = segno.make(
        text,
        version=version,
        error=stufe.lower(),
        mask=maske,
        boost_error=False,
        mode="byte",
        micro=False,
    )
    zeilen = ["".join("1" if m else "0" for m in zeile) for zeile in qr.matrix]
    erwartet = 4 * int(qr.version) + 17
    if not qr.version:
        raise SystemExit("segno hat keine feste Version gewählt")
    if len(zeilen) != erwartet or any(len(z) != erwartet for z in zeilen):
        raise SystemExit(f"Unerwartete Matrixgröße: {len(zeilen)} statt {erwartet}")
    return qr, zeilen


def main() -> None:
    faelle = []

    def ergaenze(gruppe: str, name: str, text: str, version, stufe: str, maske):
        qr, zeilen = matrix_von(text, version, stufe, maske)
        if maske is not None and qr.mask != maske:
            raise SystemExit("segno hat die erzwungene Maske nicht übernommen")
        faelle.append({
            "gruppe": gruppe,
            "name": name,
            "text": text,
            "version": int(qr.version),
            "stufe": stufe,
            "maske": maske,
            "referenzMaske": qr.mask,
            "zeilen": zeilen,
        })

    # 1) Kapazitätsgrenze je Version und Stufe, zwei Masken.
    for version in (1, 2, 5, 10):
        for stufe in STUFEN:
            grenze = kapazitaet(version, stufe)
            for maske in (0, 7):
                ergaenze("kapazitaet", f"v{version}-{stufe}-m{maske}-{grenze}B",
                         "A" * grenze, version, stufe, maske)

    # 2) Alle acht Masken (Version 1 alle Stufen, Version 2 Stufe L).
    for stufe in STUFEN:
        grenze = kapazitaet(1, stufe)
        for maske in MASKS:
            ergaenze("masken", f"v1-{stufe}-m{maske}",
                     "A" * max(1, grenze - 2), 1, stufe, maske)
    for maske in MASKS:
        ergaenze("masken", f"v2-L-m{maske}", "A" * 20, 2, "L", maske)

    # 3) Echte Texte bei kleinster passender Version (ermittelt von segno).
    for name, text in TEXTE.items():
        for stufe in STUFEN:
            probe = segno.make(text, error=stufe.lower(), boost_error=False, mode="byte", micro=False)
            for maske in (0, 7):
                ergaenze("texte", f"{name}-{stufe}-m{maske}", text,
                         int(probe.version), stufe, maske)

    # 4) Echte Texte ohne erzwungene Version/Maske — prüft die Wahl der Version.
    auto = []
    for name, text in TEXTE.items():
        for stufe in STUFEN:
            qr = segno.make(text, error=stufe.lower(), boost_error=False, mode="byte", micro=False)
            auto.append({
                "name": f"{name}-{stufe}",
                "text": text,
                "version": int(qr.version),
                "stufe": stufe,
                "referenzMaske": qr.mask,
            })

    json.dump(
        {
            "werkzeug": f"segno {segno.__version__} (Python), Byte-Modus, boost_error=False",
            "faelle": faelle,
            "automatisch": auto,
        },
        sys.stdout,
        ensure_ascii=False,
        separators=(",", ":"),
    )


if __name__ == "__main__":
    main()
