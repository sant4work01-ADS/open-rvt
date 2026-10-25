#!/usr/bin/env python3
"""Genera las tablas Markdown del informe O001 a partir de resultados/*.json.

Uso:
    ~/.venvs/openrvt/bin/python evaluacion/resumir.py \
        AC20-FZK-Haus AC20-Institute-Var-2 IFC2X3-Building-Architecture
"""

from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
RES = RAIZ / "resultados"


def cargar(muestra):
    a = json.loads((RES / f"{muestra}_a.json").read_text(encoding="utf-8"))
    b = json.loads((RES / f"{muestra}_b.json").read_text(encoding="utf-8"))
    c = json.loads((RES / f"{muestra}_comparacion.json").read_text(encoding="utf-8"))
    return a, b, c


def fmt(x, n=3):
    if x is None:
        return "—"
    return f"{x:,.{n}f}".replace(",", " ")


def tabla_global(muestras):
    print("### Tabla por muestra y motor\n")
    print("| Muestra | Motor | Apertura (s) | Teselado (s) | Extracción (s) | Total (s) | Triángulos | RSS pico (MB) | Elementos | Sin malla | Malla abierta |")
    print("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    for m in muestras:
        for motor, d in zip(("A", "B"), cargar(m)[:2]):
            print(
                f"| {m} | {motor} | {d['apertura_s']:.3f} | {d['teselado_s']:.3f} | "
                f"{d['extraccion_s']:.3f} | {d['total_s']:.3f} | {d['triangulos']:,} | "
                f"{d['pico_rss_mb']:.1f} | {d['n_objetivo']} | {d['n_sin_malla']} | {d['n_abiertas']} |"
            )


def tabla_concordancia(muestras):
    print("\n### Concordancia A vs B (volumen de malla)\n")
    print("| Muestra | Comunes | Comparables | Pasan 1 % | Concordancia | Solo cerradas |")
    print("|---|---:|---:|---:|---:|---:|")
    for m in muestras:
        c = cargar(m)[2]
        v = c["volumen"]
        print(
            f"| {m} | {c['comunes']} | {v['comparables']} | {v['pasan_1pct']} | "
            f"{v['concordancia_pct']:.2f} % | {v['concordancia_cerradas_pct']:.2f} % "
            f"({v['comparables_cerradas']}) |"
        )


def tabla_peores(muestras, n=10):
    print(f"\n### {n} peores diferencias de volumen A vs B\n")
    print("| Muestra | Clase | Nombre | Vol. A (m³) | Vol. B (m³) | Dif. |")
    print("|---|---|---|---:|---:|---:|")
    for m in muestras:
        c = cargar(m)[2]
        for d in c["volumen"]["peores"][:n]:
            print(
                f"| {m} | {d['clase']} | {d['nombre']} | {d['volumen_a']:.6f} | "
                f"{d['volumen_b']:.6f} | {d['dif_rel'] * 100:.3f} % |"
            )


def _rel(malla, qto):
    if malla is None or qto is None or qto == 0:
        return None
    return abs(malla - qto) / abs(qto)


def tabla_base(muestras):
    print("\n### Cantidades base: cobertura y cercanía (mediana de |malla − qto| / |qto|)\n")
    print("| Muestra | Motor | Volumen: con qto | Volumen: pasan 2 % | Mediana vol. | Área: con qto | Área: pasan 2 % | Mediana área |")
    print("|---|---|---:|---:|---:|---:|---:|---:|")
    for m in muestras:
        for motor, d in zip(("A", "B"), cargar(m)[:2]):
            filas = d["filas"]
            vol = [(_rel(f.get("volumen_malla"), f.get("qto_volumen")), f) for f in filas]
            vol = [(r, f) for r, f in vol if r is not None]
            area = [(_rel(f.get("area_planta"), f.get("qto_area")), f) for f in filas]
            area = [(r, f) for r, f in area if r is not None]
            mv = statistics.median(r for r, _ in vol) if vol else None
            ma = statistics.median(r for r, _ in area) if area else None
            print(
                f"| {m} | {motor} | {len(vol)} | {sum(1 for r, _ in vol if r > 0.02)} | "
                f"{'—' if mv is None else f'{mv * 100:.2f} %'} | {len(area)} | "
                f"{sum(1 for r, _ in area if r > 0.02)} | {'—' if ma is None else f'{ma * 100:.2f} %'} |"
            )


def tabla_base_clase(muestras):
    print("\n### Cantidades base de volumen por clase (motor A)\n")
    print("| Muestra | Clase | n | Con qto volumen | Pasan 2 % | Mediana |")
    print("|---|---|---:|---:|---:|---:|")
    for m in muestras:
        d = cargar(m)[0]
        grupos = {}
        for f in d["filas"]:
            g = grupos.setdefault(f["clase"], {"n": 0, "q": [], "pasa": 0})
            g["n"] += 1
            rel = _rel(f.get("volumen_malla"), f.get("qto_volumen"))
            if rel is not None:
                g["q"].append(rel)
                if rel > 0.02:
                    g["pasa"] += 1
        for clase, g in sorted(grupos.items()):
            med = statistics.median(g["q"]) if g["q"] else None
            print(
                f"| {m} | {clase} | {g['n']} | {len(g['q'])} | {g['pasa']} | "
                f"{'—' if med is None else f'{med * 100:.2f} %'} |"
            )


def tabla_tipos(muestras):
    print("\n### Resumen por tipo (motor A; largo = ancho en puertas/ventanas)\n")
    print("| Muestra | Clase | n | Volumen total (m³) | Área planta total (m²) | Largo/ancho medio (m) | Alto medio (m) | Área lateral total (m²) |")
    print("|---|---|---:|---:|---:|---:|---:|---:|")
    for m in muestras:
        d = cargar(m)[0]
        grupos = {}
        for f in d["filas"]:
            g = grupos.setdefault(
                f["clase"],
                {"n": 0, "vol": 0.0, "area": 0.0, "largo": [], "alto": [], "lat": 0.0},
            )
            g["n"] += 1
            g["vol"] += f.get("volumen_malla") or 0.0
            g["area"] += f.get("area_planta") or 0.0
            if f.get("largo") is not None:
                g["largo"].append(f["largo"])
            if f.get("alto") is not None:
                g["alto"].append(f["alto"])
            g["lat"] += f.get("area_lateral") or 0.0
        for clase, g in sorted(grupos.items()):
            largo = statistics.mean(g["largo"]) if g["largo"] else None
            alto = statistics.mean(g["alto"]) if g["alto"] else None
            print(
                f"| {m} | {clase} | {g['n']} | {g['vol']:.3f} | {g['area']:.3f} | "
                f"{fmt(largo, 4)} | {fmt(alto, 4)} | {g['lat']:.3f} |"
            )


def tabla_faltantes(muestras):
    print("\n### Faltantes y mallas abiertas\n")
    for m in muestras:
        a, b, c = cargar(m)
        abiertas_a = [f["clase"] for f in a["filas"] if not f["cerrada"] and not f.get("sin_malla")]
        abiertas_b = [f["clase"] for f in b["filas"] if not f["cerrada"] and not f.get("sin_malla")]
        sin_a = [f["clase"] for f in a["filas"] if f.get("sin_malla")]
        sin_b = [f["clase"] for f in b["filas"] if f.get("sin_malla")]
        print(
            f"- **{m}**: faltan en A={len(c['faltan_en_a'])}, faltan en B={len(c['faltan_en_b'])}; "
            f"sin malla A={len(sin_a)} {sorted(set(sin_a))}, B={len(sin_b)} {sorted(set(sin_b))}; "
            f"abiertas A={len(abiertas_a)} {sorted(set(abiertas_a))}, "
            f"B={len(abiertas_b)} {sorted(set(abiertas_b))}."
        )


def main():
    muestras = sys.argv[1:] or [
        p.name[: -len("_a.json")]
        for p in sorted(RES.glob("*_a.json"))
    ]
    print("# Resumen generado\n")
    tabla_global(muestras)
    tabla_concordancia(muestras)
    tabla_peores(muestras)
    tabla_base(muestras)
    tabla_base_clase(muestras)
    tabla_tipos(muestras)
    tabla_faltantes(muestras)


if __name__ == "__main__":
    main()
