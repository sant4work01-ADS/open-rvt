#!/usr/bin/env python3
"""Compara los resultados A (IfcOpenShell) y B (web-ifc) de la evaluación O001.

Uso:
    python evaluacion/comparar.py resultados/<muestra>_a.csv resultados/<muestra>_b.csv
    python evaluacion/comparar.py ... --json resultados/<muestra>_comparacion.json

Criterios:
* volumen de malla: diferencia relativa > 1 % se marca;
* cantidad base de cada motor: diferencia relativa > 2 % se marca;
* faltantes: GlobalId que está en un motor y no en el otro.
"""

from __future__ import annotations

import argparse
import csv
import json
import statistics
from pathlib import Path


def leer_csv(ruta):
    with Path(ruta).open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _num(txt):
    if txt is None or str(txt).strip() == "":
        return None
    try:
        return float(txt)
    except (TypeError, ValueError):
        return None


def _bool(txt):
    return str(txt).strip().lower() in {"true", "1", "si", "sí"}


def diferencia_relativa(a, b, denominador="a"):
    """|a-b| / |referencia|; 0 si ambos son 0; None si falta alguno.

    `denominador="a"` usa A como referencia (comparación A contra B);
    `denominador="b"` usa B (malla contra cantidad base del archivo).
    Si la referencia vale 0 se usa el otro valor para no dividir entre cero.
    """
    if a is None or b is None:
        return None
    ref = abs(a) if denominador == "a" else abs(b)
    if ref == 0:
        ref = abs(b) if denominador == "a" else abs(a)
    if ref == 0:
        return 0.0
    return abs(a - b) / ref


def _indice(filas):
    indice = {}
    duplicados = []
    for f in filas:
        gid = f.get("globalid") or ""
        if gid in indice:
            duplicados.append(gid)
        else:
            indice[gid] = f
    return indice, duplicados


def _resumen_qto(filas, campo_malla, campo_qto, umbral):
    pares = []
    for f in filas:
        malla = _num(f.get(campo_malla))
        qto = _num(f.get(campo_qto))
        if malla is None or qto is None or abs(qto) < 1e-12:
            continue
        rel = diferencia_relativa(malla, qto, "b")
        pares.append(
            {
                "globalid": f.get("globalid"),
                "clase": f.get("clase"),
                "nombre": f.get("nombre"),
                "malla": malla,
                "qto": qto,
                "dif_rel": rel,
                "pasa": rel is not None and rel > umbral,
            }
        )
    rels = [p["dif_rel"] for p in pares if p["dif_rel"] is not None]
    rels_ord = sorted(rels)
    p95 = rels_ord[int(round(0.95 * (len(rels_ord) - 1)))] if rels_ord else None
    return {
        "comparables": len(pares),
        "pasan": sum(1 for p in pares if p["pasa"]),
        "umbral": umbral,
        "mediana_dif_rel": statistics.median(rels) if rels else None,
        "p95_dif_rel": p95,
        "peores": sorted(pares, key=lambda p: p["dif_rel"], reverse=True)[:10],
    }


def comparar_filas(filas_a, filas_b, umbral_volumen=0.01, umbral_qto=0.02):
    """Compara listas de filas (dicts con las columnas del CSV)."""
    ia, dup_a = _indice(filas_a)
    ib, dup_b = _indice(filas_b)
    ids_a, ids_b = set(ia), set(ib)

    diferencias = []
    for gid in sorted(ids_a & ids_b):
        fa, fb = ia[gid], ib[gid]
        va = _num(fa.get("volumen_malla"))
        vb = _num(fb.get("volumen_malla"))
        rel = diferencia_relativa(va, vb)
        if rel is None:
            continue
        diferencias.append(
            {
                "globalid": gid,
                "clase": fa.get("clase") or fb.get("clase"),
                "nombre": fa.get("nombre") or fb.get("nombre"),
                "volumen_a": va,
                "volumen_b": vb,
                "dif_rel": rel,
                "pasa_1pct": rel > umbral_volumen,
                "cerrada_a": _bool(fa.get("cerrada")),
                "cerrada_b": _bool(fb.get("cerrada")),
            }
        )

    con_volumen = [d for d in diferencias if d["volumen_a"] is not None and d["volumen_b"] is not None]
    dentro = [d for d in con_volumen if d["dif_rel"] <= umbral_volumen]
    cerradas = [d for d in con_volumen if d["cerrada_a"] and d["cerrada_b"]]
    dentro_cerradas = [d for d in cerradas if d["dif_rel"] <= umbral_volumen]

    return {
        "n_a": len(filas_a),
        "n_b": len(filas_b),
        "comunes": len(ids_a & ids_b),
        "faltan_en_b": sorted(ids_a - ids_b),
        "faltan_en_a": sorted(ids_b - ids_a),
        "duplicados_a": sorted(set(dup_a)),
        "duplicados_b": sorted(set(dup_b)),
        "volumen": {
            "comparables": len(con_volumen),
            "pasan_1pct": sum(1 for d in con_volumen if d["pasa_1pct"]),
            "concordancia_pct": 100.0 * len(dentro) / len(con_volumen) if con_volumen else None,
            "concordancia_cerradas_pct": 100.0 * len(dentro_cerradas) / len(cerradas) if cerradas else None,
            "comparables_cerradas": len(cerradas),
            "peores": sorted(con_volumen, key=lambda d: d["dif_rel"], reverse=True)[:10],
            "diferencias": con_volumen,
        },
        "qto_volumen_a": _resumen_qto(filas_a, "volumen_malla", "qto_volumen", umbral_qto),
        "qto_volumen_b": _resumen_qto(filas_b, "volumen_malla", "qto_volumen", umbral_qto),
        "qto_area_a": _resumen_qto(filas_a, "area_planta", "qto_area", umbral_qto),
        "qto_area_b": _resumen_qto(filas_b, "area_planta", "qto_area", umbral_qto),
    }


def _resumen_texto(r):
    v = r["volumen"]
    lineas = [
        f"filas: A={r['n_a']} B={r['n_b']} comunes={r['comunes']}",
        f"faltan en A: {len(r['faltan_en_a'])} · faltan en B: {len(r['faltan_en_b'])}",
        f"volumen: {v['comparables']} comparables, {v['pasan_1pct']} pasan del 1 %; "
        f"concordancia={v['concordancia_pct']:.2f} % "
        f"(solo cerradas: {v['concordancia_cerradas_pct']:.2f} % de {v['comparables_cerradas']})",
    ]
    for etiqueta in ("qto_volumen_a", "qto_volumen_b", "qto_area_a", "qto_area_b"):
        q = r[etiqueta]
        med = q["mediana_dif_rel"]
        med_txt = "—" if med is None else f"{med * 100:.2f} %"
        lineas.append(
            f"{etiqueta}: {q['comparables']} comparables, {q['pasan']} pasan del "
            f"{q['umbral'] * 100:.0f} %, mediana={med_txt}"
        )
    if v["peores"]:
        lineas.append("peores diferencias de volumen:")
        for d in v["peores"]:
            lineas.append(
                f"  {d['clase']} {d['nombre']!r} ({d['globalid']}): "
                f"{d['volumen_a']:.6f} vs {d['volumen_b']:.6f} = {d['dif_rel'] * 100:.2f} %"
            )
    return "\n".join(lineas)


def main():
    ap = argparse.ArgumentParser(description="Compara resultados A y B de O001")
    ap.add_argument("a", help="CSV del motor A")
    ap.add_argument("b", help="CSV del motor B")
    ap.add_argument("--json", help="ruta para escribir el resultado completo en JSON")
    ap.add_argument("--umbral-volumen", type=float, default=0.01)
    ap.add_argument("--umbral-qto", type=float, default=0.02)
    args = ap.parse_args()

    resultado = comparar_filas(
        leer_csv(args.a), leer_csv(args.b), args.umbral_volumen, args.umbral_qto
    )
    resultado["archivo_a"] = str(args.a)
    resultado["archivo_b"] = str(args.b)
    print(_resumen_texto(resultado))
    if args.json:
        Path(args.json).parent.mkdir(parents=True, exist_ok=True)
        Path(args.json).write_text(json.dumps(resultado, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
